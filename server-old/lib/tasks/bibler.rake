# frozen_string_literal: true

require 'csv'

namespace :bibler do
  desc 'Import all bible translations from bible_databases project'
  task :import, [:path] => :environment do |_t, args|
    require File.join(Rails.root, 'lib', 'bibler')

    base_path = args[:path] || ENV['BIBLER_SERVER_BIBLE_DATABASES_PATH'] || '../bible_databases'
    base_path = File.expand_path(base_path, Rails.root)

    unless Dir.exist?(base_path)
      puts "Error: bible_databases directory not found at #{base_path}"
      puts 'Please provide the path as: rake bibler:import[../bible_databases]'
      exit 1
    end

    include Bibler::Data

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

    # Disable logging for faster imports
    old_ar_logger = ActiveRecord::Base.logger
    old_rails_logger = Rails.logger

    # Set loggers to null
    ActiveRecord::Base.logger = nil
    Rails.logger = Logger.new(nil)

    begin
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
          # Classify from lookup key; always persist source-provided book_name exactly.
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
    ensure
      # Restore logging
      ActiveRecord::Base.logger = old_ar_logger
      Rails.logger = old_rails_logger
    end

    puts 'Done!'
  end
end
