# frozen_string_literal: true

# Author: Preston Lee
module Mcp
  module Tools
    class GetBookInfo < BaseTool
      def tool_definition
        {
          name: 'get_book_info',
          description: 'Get information about a specific book in a bible',
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
              }
            },
            required: ['bible', 'book']
          }
        }
      end

      protected

      def validate_arguments(arguments)
        raise ArgumentError, 'bible is required' if arguments['bible'].blank?
        raise ArgumentError, 'book is required' if arguments['book'].blank?
      end

      def execute(arguments)
        bible = find_bible(arguments['bible'])
        book = find_book(bible, arguments['book'])

        chapters = Verse.where(bible: bible, book: book).pluck(:chapter).uniq.sort

        {
          content: [
            {
              type: 'text',
              text: JSON.pretty_generate(
                {
                  uuid: book.uuid,
                  name: book.name,
                  ordinal: book.ordinal,
                  testament: book.read_attribute(:testament),
                  bible: {
                    uuid: bible.uuid,
                    name: bible.name,
                    abbreviation: bible.abbreviation
                  },
                  chapters: chapters,
                  chapter_count: chapters.length
                }
              )
            }
          ]
        }
      end
    end
  end
end
