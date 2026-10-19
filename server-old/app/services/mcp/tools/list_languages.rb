# frozen_string_literal: true

# Author: Preston Lee
module Mcp
  module Tools
    class ListLanguages < BaseTool
      def tool_definition
        {
          name: 'list_languages',
          description: 'List all distinct language codes and their human-readable names available in the bible database',
          inputSchema: {
            type: 'object',
            properties: {},
            required: []
          }
        }
      end

      protected

      def validate_arguments(_arguments)
        # No required arguments
      end

      def execute(_arguments)
        languages = Bible.distinct.order(:language).pluck(:language)

        language_list = languages.map do |code|
          {
            code: code,
            name: Bible::LANGUAGE_NAMES[code] || code.upcase
          }
        end

        {
          content: [
            {
              type: 'text',
              text: JSON.pretty_generate(language_list)
            }
          ]
        }
      end
    end
  end
end
