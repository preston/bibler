# frozen_string_literal: true

# Author: Preston Lee
module Mcp
  module Tools
    class ListBooks < BaseTool
      def tool_definition
        {
          name: 'list_books',
          description: 'List books in a bible translation',
          inputSchema: {
            type: 'object',
            properties: {
              bible: {
                type: 'string',
                description: 'Bible UUID (optional - lists all books if omitted)'
              }
            },
            required: []
          }
        }
      end

      protected

      def validate_arguments(_arguments)
        # No required arguments
      end

      def execute(arguments)
        if arguments['bible'].present?
          bible = find_bible(arguments['bible'])
          books = bible.books.merge(Book.ordered_for_display)
        else
          books = Book.includes(:bible).merge(Book.ordered_with_bible)
        end

        {
          content: [
            {
              type: 'text',
              text: JSON.pretty_generate(
                books.map do |book|
                  {
                    uuid: book.uuid,
                    name: book.name,
                    ordinal: book.ordinal,
                    testament: book.read_attribute(:testament),
                    bible: book.bible.name
                  }
                end
              )
            }
          ]
        }
      end
    end
  end
end
