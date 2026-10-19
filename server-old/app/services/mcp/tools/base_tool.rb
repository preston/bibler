# frozen_string_literal: true

# Author: Preston Lee
module Mcp
  module Tools
    class BaseTool
      def call(arguments)
        validate_arguments(arguments)
        execute(arguments)
      rescue ArgumentError, ActiveRecord::RecordNotFound
        # Let these propagate to controller for proper JSON-RPC error handling
        raise
      rescue StandardError => e
        {
          error: {
            code: -32000,
            message: e.message
          }
        }
      end

      protected

      def validate_arguments(_arguments)
        # Override in subclasses
      end

      def execute(_arguments)
        raise NotImplementedError, 'Subclasses must implement execute'
      end

      def find_bible(bible_identifier)
        bible = Bible.find_by(id: bible_identifier)
        raise ActiveRecord::RecordNotFound, "Bible not found: #{bible_identifier}" unless bible
        bible
      end

      def find_book(bible, book_identifier)
        book = bible.books.find_by(id: book_identifier)
        raise ActiveRecord::RecordNotFound, "Book not found: #{book_identifier}" unless book
        book
      end

      def format_verse_reference(verse)
        "#{verse.book.name} #{verse.chapter}:#{verse.ordinal}"
      end
    end
  end
end
