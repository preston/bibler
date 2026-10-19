# frozen_string_literal: true

# Author: Preston Lee
module Mcp
  module Tools
    class SearchVerses < BaseTool
      def tool_definition
        {
          name: 'search_verses',
          description: 'Search for verses by text query in a specific bible translation',
          inputSchema: {
            type: 'object',
            properties: {
              bible: {
                type: 'string',
                description: 'Bible UUID'
              },
              query: {
                type: 'string',
                description: 'Text to search for in verses'
              },
              limit: {
                type: 'integer',
                description: 'Maximum number of results (default: 100)',
                default: 100
              }
            },
            required: ['bible', 'query']
          }
        }
      end

      protected

      def validate_arguments(arguments)
        raise ArgumentError, 'bible is required' if arguments['bible'].blank?
        raise ArgumentError, 'query is required' if arguments['query'].blank?
      end

      def execute(arguments)
        bible = find_bible(arguments['bible'])
        query = arguments['query']
        limit = arguments['limit'] || 100

        verses = Verse.limit(limit)
                      .where(bible: bible)
                      .search_by_text(query)
                      .includes(:book, :bible)
                      .order('book_id ASC, chapter ASC, ordinal ASC')

        {
          content: [
            {
              type: 'text',
              text: JSON.pretty_generate(
                verses.map do |verse|
                  {
                    reference: format_verse_reference(verse),
                    text: verse.text,
                    book: verse.book.name,
                    chapter: verse.chapter,
                    verse: verse.ordinal,
                    bible: verse.bible.name
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
