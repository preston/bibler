# frozen_string_literal: true

require 'csv'

require 'bibler'

include Bibler::Data # rubocop:disable Style/MixinUsage

# Get path from environment variable or use default
base_path = ENV['BIBLER_SERVER_BIBLE_DATABASES_PATH'] || File.expand_path('../bible_databases', Rails.root)

unless Dir.exist?(base_path)
  puts "Error: bible_databases directory not found at #{base_path}"
  puts 'Please set BIBLER_SERVER_BIBLE_DATABASES_PATH environment variable or ensure ../bible_databases exists'
  exit 1
end

# Bootstrap bibles (metadata from manifest)
bootstrap!(base_path)

# Load translation manifest
translations = parse_translation_manifest(base_path)
if translations.empty?
  puts "Error: Could not parse translation manifest from #{base_path}/docs/main_readme/translation_list.md"
  exit 1
end

csv_dir = File.join(base_path, 'formats', 'csv')
unless Dir.exist?(csv_dir)
  puts "Error: CSV directory not found at #{csv_dir}"
  exit 1
end

puts 'Loading bible verses...'

# Process each CSV file
Dir.glob(File.join(csv_dir, '*.csv')).sort.each do |csv_file|
  filename = File.basename(csv_file, '.csv')
  next unless translations.key?(filename)

  metadata = translations[filename]
  bible = Bible.find_by(abbreviation: filename)
  unless bible
    puts "Warning: Bible #{filename} not found in database, skipping..."
    next
  end

  print "\t#{bible.name}..."
  count = 0

  # First pass: extract unique book names in order of first appearance
  book_names_in_order = []
  seen_books = Set.new
  CSV.foreach(csv_file, headers: true) do |row|
    book_name = row['Book']
    next unless book_name

    # Use exact book name from CSV (no normalization for book creation)
    unless seen_books.include?(book_name)
      book_names_in_order << book_name
      seen_books.add(book_name)
    end
  end

  # Create books for this bible
  book_cache = {}
  book_lookup_cache = {}
  book_names_in_order.each_with_index do |book_name, index|
    position = index + 1
    # Classify from lookup key; preserve source book names exactly.
    lookup_key = book_lookup_key(book_name)
    testament = classify_book_testament(lookup_key)

    book = Book.find_or_create_by(bible:, name: book_name) do |b|
      b.testament = testament
      b.ordinal = position
    end

    # Update ordinal and testament if book already existed
    if book.ordinal != position || book.testament != testament
      book.ordinal = position
      book.testament = testament
      book.save!
    end

    book_cache[book_name] = book
    book_lookup_cache[lookup_key] ||= book
  end

  # Second pass: import verses
  # Check if this is an initial import (no verses exist for this bible)
  is_initial_import = Verse.where(bible:).count.zero?

  if is_initial_import
    # Bulk insert for initial imports (much faster)
    verse_records = []
    CSV.foreach(csv_file, headers: true) do |row|
      book_name = row['Book']
      chapter = row['Chapter'].to_i
      verse_ordinal = row['Verse'].to_i
      text = row['Text']

      next unless book_name && chapter.positive? && verse_ordinal.positive? && text

      book = book_cache[book_name] || book_lookup_cache[book_lookup_key(book_name)]
      next unless book

      verse_records << {
        id: SecureRandom.uuid,
        bible_id: bible.id,
        book_id: book.id,
        chapter:,
        ordinal: verse_ordinal,
        text:,
        created_at: Time.current,
        updated_at: Time.current
      }

      # Batch inserts for better performance
      if verse_records.length >= 1000
        Verse.upsert_all(
          verse_records,
          unique_by: :index_verses_on_bible_book_chapter_ordinal
        )
        count += verse_records.length
        verse_records = []
      end
    end

    # Insert remaining records
    if verse_records.any?
      Verse.upsert_all(
        verse_records,
        unique_by: :index_verses_on_bible_book_chapter_ordinal
      )
      count += verse_records.length
    end
  else
    # Use find_or_initialize_by for re-imports (idempotent, updates existing verses)
    CSV.foreach(csv_file, headers: true) do |row|
      book_name = row['Book']
      chapter = row['Chapter'].to_i
      verse_ordinal = row['Verse'].to_i
      text = row['Text']

      next unless book_name && chapter.positive? && verse_ordinal.positive? && text

      # Use exact source name first, then fallback lookup key for matching only.
      book = book_cache[book_name] || book_lookup_cache[book_lookup_key(book_name)]
      unless book
        puts "\nWarning: Book '#{book_name}' not found in cache, skipping verse..."
        next
      end

      # Create or update verse
      verse = Verse.find_or_initialize_by(
        bible:,
        book:,
        chapter:,
        ordinal: verse_ordinal
      )
      verse.text = text
      if verse.valid?
        verse.save!
        count += 1
      else
        puts "\nWarning: Invalid verse #{bible.abbreviation} #{book.name} #{chapter}:#{verse_ordinal} - #{verse.errors.full_messages.join(', ')}"
      end
    end
  end

  puts " #{count}"
end

puts 'Done!'

# Configure default AI reference bibles (idempotent).
puts 'Configuring AI default reference bibles...'
Bible.update_all(
  ai_default_english: false,
  ai_default_greek: false,
  ai_default_hebrew_ot: false,
  ai_default_aramaic: false
)

ai_default_targets = {
  ai_default_english: 'KJV',
  ai_default_greek: 'Byz',
  ai_default_hebrew_ot: 'HebModern'
}

ai_default_targets.each do |flag, abbreviation|
  bible = Bible.find_by('LOWER(abbreviation) = ?', abbreviation.downcase)
  if bible
    bible.update!(flag => true)
    puts "Set #{bible.abbreviation} as #{flag}."
  else
    puts "Warning: Could not find Bible with abbreviation #{abbreviation} to set #{flag}."
  end
end

# RBAC bootstrap (idempotent). Change the default password in production.
puts 'Bootstrapping RBAC...'
admin_role = Role.find_or_create_by!(name: 'Administrator') do |r|
  r.is_default = false
  r.administrator = true
  r.bibles = true
  r.access = true
  r.curation = true
end
admin_user = User.find_or_initialize_by(username: 'administrator')
if admin_user.new_record?
  admin_user.email = 'administrator@localhost'
  admin_user.name = 'Administrator'
  admin_user.password = 'password'
  admin_user.password_confirmation = 'password'
  admin_user.save!
else
  admin_user.update!(email: admin_user.email.presence || 'administrator@localhost', name: admin_user.name.presence || 'Administrator')
end
admin_user.roles << admin_role unless admin_user.roles.include?(admin_role)

# Eight non-administrator users covering every combination of bibles / access / curation.
seed_password = 'password'
seed_permission_users = [
  { username: 'seed_none', name: 'Seed (no extra perms)', bibles: false, access: false, curation: false },
  { username: 'seed_bibles', name: 'Seed (bibles)', bibles: true, access: false, curation: false },
  { username: 'seed_access', name: 'Seed (access)', bibles: false, access: true, curation: false },
  { username: 'seed_curation', name: 'Seed (curation)', bibles: false, access: false, curation: true },
  { username: 'seed_bibles_access', name: 'Seed (bibles + access)', bibles: true, access: true, curation: false },
  { username: 'seed_bibles_curation', name: 'Seed (bibles + curation)', bibles: true, access: false, curation: true },
  { username: 'seed_access_curation', name: 'Seed (access + curation)', bibles: false, access: true, curation: true },
  { username: 'seed_all', name: 'Seed (bibles + access + curation)', bibles: true, access: true, curation: true }
]

seed_permission_users.each do |cfg|
  parts = []
  parts << 'bibles' if cfg[:bibles]
  parts << 'access' if cfg[:access]
  parts << 'curation' if cfg[:curation]
  role_label = parts.empty? ? '(none)' : parts.join(' + ')
  role_name = "Seed #{role_label}"

  role = Role.find_or_create_by!(name: role_name) do |r|
    r.is_default = false
    r.administrator = false
    r.bibles = cfg[:bibles]
    r.access = cfg[:access]
    r.curation = cfg[:curation]
  end
  # Keep flags in sync if the role already existed.
  role.update!(
    administrator: false,
    bibles: cfg[:bibles],
    access: cfg[:access],
    curation: cfg[:curation]
  )

  email = "#{cfg[:username]}@localhost"
  user = User.find_or_initialize_by(username: cfg[:username])
  user.email = email
  user.name = cfg[:name]
  user.password = seed_password
  user.password_confirmation = seed_password
  user.save!
  user.roles << role unless user.roles.include?(role)
end

puts 'RBAC bootstrap complete.'

