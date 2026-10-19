# frozen_string_literal: true

# Author: Preston Lee
module Mcp
  module Tools
    class GetChapter < BaseTool
      def tool_definition
        {
          name: 'get_chapter',
          description: 'Get all verses in a specific chapter',
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
              }
            },
            required: ['bible', 'book', 'chapter']
          }
        }
      end

      protected

      def validate_arguments(arguments)
        raise ArgumentError, 'bible is required' if arguments['bible'].blank?
        raise ArgumentError, 'book is required' if arguments['book'].blank?
        raise ArgumentError, 'chapter is required' if arguments['chapter'].blank?
      end

      def execute(arguments)
        bible = find_bible(arguments['bible'])
        book = find_book(bible, arguments['book'])
        chapter = arguments['chapter'].to_i

        verses = Verse.where(bible: bible, book: book, chapter: chapter)
                      .order('ordinal ASC')
                      .includes(:book, :bible)

        {
          content: [
            {
              type: 'text',
              text: JSON.pretty_generate(
                {
                  reference: "#{book.name} #{chapter}",
                  verses: verses.map do |verse|
                    {
                      verse: verse.ordinal,
                      text: verse.text
                    }
                  end,
                  book: book.name,
                  chapter: chapter,
                  bible: bible.name
                }
              )
            }
          ]
        }
      end
    end
  end
end
