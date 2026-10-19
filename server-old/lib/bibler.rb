# frozen_string_literal: true

require 'csv'
require 'set'

module Bibler
  # Author: Preston Lee
  module Data
    OT_BOOK_LOOKUP = %w[
      genesis exodus leviticus numbers deuteronomy
      joshua judges ruth 1\ samuel 2\ samuel
      1\ kings 2\ kings 1\ chronicles 2\ chronicles
      ezra nehemiah esther
      job psalms proverbs ecclesiastes song\ of\ solomon
      isaiah jeremiah lamentations ezekiel daniel
      hosea joel amos obadiah jonah micah nahum
      habakkuk zephaniah haggai zechariah malachi
    ].freeze

    NT_BOOK_LOOKUP = %w[
      matthew mark luke john
      acts
      romans 1\ corinthians 2\ corinthians galatians ephesians
      philippians colossians 1\ thessalonians 2\ thessalonians
      1\ timothy 2\ timothy titus philemon
      hebrews james 1\ peter 2\ peter 1\ john 2\ john 3\ john jude
      revelation
    ].freeze

    APOCRYPHA_BOOK_LOOKUP = %w[
      tobit judith wisdom sirach baruch
      1\ maccabees 2\ maccabees 3\ maccabees 4\ maccabees
      1\ esdras 2\ esdras
      bel\ and\ the\ dragon susanna
      prayer\ of\ azariah prayer\ of\ manasses
      additions\ to\ esther
      1\ enoch
      odes
    ].freeze

    def parse_translation_manifest(base_path)
      manifest_file = File.join(base_path, 'docs', 'main_readme', 'translation_list.md')
      return {} unless File.exist?(manifest_file)

      translations = {}
      File.readlines(manifest_file).each do |line|
        # Parse format: - **ASV (en)**: ASV: American Standard Version (1901)
        match = line.match(/^-\s+\*\*(\w+)\s+\(([^)]+)\)\*\*:\s+(.+)$/)
        next unless match

        abbreviation = match[1]
        language = match[2]
        name = match[3].strip
        translations[abbreviation] = { language:, name: }
      end
      translations
    end

    def extract_license(base_path, abbreviation)
      readme_file = File.join(base_path, 'sources', abbreviation, 'README.md')
      return '' unless File.exist?(readme_file)

      File.readlines(readme_file).each do |line|
        match = line.match(/^\*\*License:\*\*\s*(.+)$/)
        return match[1].strip if match
      end
      ''
    end

    # Lookup-only key for importer matching. Never persist this as a book name.
    def self.book_lookup_key(name)
      key = name.to_s.strip
      key = key.gsub(/\bIII\s+/i, '3 ')
      key = key.gsub(/\bII\s+/i, '2 ')
      key = key.gsub(/\bI\s+/i, '1 ')
      key.downcase
    end

    def book_lookup_key(name)
      Bibler::Data.book_lookup_key(name)
    end

    # For logging when testament is +other+ (apocrypha list vs unrecognized name).
    def self.other_testament_reason_for_book_name(name)
      key = book_lookup_key(name)
      return 'apocrypha' if APOCRYPHA_BOOK_LOOKUP.include?(key)

      'unknown'
    end

    # Returns stored enum string: "old" | "new" | "other"
    def classify_book_testament(lookup_key)
      key = lookup_key.to_s.downcase.strip
      return 'old' if OT_BOOK_LOOKUP.include?(key)
      return 'new' if NT_BOOK_LOOKUP.include?(key)
      return 'other' if APOCRYPHA_BOOK_LOOKUP.include?(key)

      'other'
    end

    def create_bibles(base_path)
      translations = parse_translation_manifest(base_path)
      return if translations.empty?

      translations.each do |abbreviation, metadata|
        license = extract_license(base_path, abbreviation)
        # Use where to avoid FriendlyId's finder override
        bible = Bible.where(abbreviation:).first_or_initialize
        bible.name = metadata[:name]
        bible.language = metadata[:language]
        bible.license = license
        bible.save!
      end
    end

    def bootstrap!(base_path)
      print 'Loading bible types...'
      create_bibles(base_path)
      puts " #{Bible.count}"
    end
  end
end
