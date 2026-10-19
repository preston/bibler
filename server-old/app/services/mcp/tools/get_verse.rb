# frozen_string_literal: true

# Author: Preston Lee
module Mcp
  module Tools
    class GetVerse < BaseTool
      def tool_definition
        {
          name: 'get_verse',
          description: 'Get a specific verse by reference (bible, book, chapter, verse)',
          inputSchema: {
            type: 'object',
            properties: {
              bible: {
                type: 'string',
                description: 'Bible UUID'
              },
              book: {
                type: 'string',
                description: 'Book UUID'
              },
              chapter: {
                type: 'integer',
                description: 'Chapter number'
              },
              verse: {
                type: 'integer',
                description: 'Verse number (ordinal)'
              }
            },
            required: ['bible', 'book', 'chapter', 'verse']
          }
        }
      end

      protected

      def validate_arguments(arguments)
        raise ArgumentError, 'bible is required' if arguments['bible'].blank?
        raise ArgumentError, 'book is required' if arguments['book'].blank?
        raise ArgumentError, 'chapter is required' if arguments['chapter'].blank?
        raise ArgumentError, 'verse is required' if arguments['verse'].blank?
      end

      def execute(arguments)
        bible = find_bible(arguments['bible'])
        book = find_book(bible, arguments['book'])
        chapter = arguments['chapter'].to_i
        verse_num = arguments['verse'].to_i

        verse = Verse.where(bible: bible, book: book, chapter: chapter, ordinal: verse_num).first
        unless verse
          ref = "#{book.name} #{chapter}:#{verse_num}"
          raise ActiveRecord::RecordNotFound, "Verse not found: #{ref}"
        end

        {
          content: [
            {
              type: 'text',
              text: JSON.pretty_generate(
                {
                  reference: format_verse_reference(verse),
                  text: verse.text,
                  book: verse.book.name,
                  chapter: verse.chapter,
                  verse: verse.ordinal,
                  bible: verse.bible.name,
                  testament: verse.book.read_attribute(:testament)
                }
              )
            }
          ]
        }
      end
    end
  end
end
