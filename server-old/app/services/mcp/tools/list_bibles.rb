# frozen_string_literal: true

# Author: Preston Lee
module Mcp
  module Tools
    class ListBibles < BaseTool
      def tool_definition
        {
          name: 'list_bibles',
          description: 'List available bible translations',
          inputSchema: {
            type: 'object',
            properties: {
              language: {
                type: 'string',
                description: 'Filter by language code (optional)'
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
        bibles = Bible.all
        bibles = bibles.where(language: arguments['language']) if arguments['language'].present?

        {
          content: [
            {
              type: 'text',
              text: JSON.pretty_generate(
                bibles.order(:name).map do |bible|
                  {
                    uuid: bible.uuid,
                    name: bible.name,
                    abbreviation: bible.abbreviation,
                    language: bible.language,
                    license: bible.license
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
