# frozen_string_literal: true

# Author: Preston Lee
module Mcp
  class ToolHandler
    TOOLS = {
      'search_verses' => Mcp::Tools::SearchVerses,
      'get_verse' => Mcp::Tools::GetVerse,
      'get_chapter' => Mcp::Tools::GetChapter,
      'list_books' => Mcp::Tools::ListBooks,
      'list_bibles' => Mcp::Tools::ListBibles,
      'get_book_info' => Mcp::Tools::GetBookInfo,
      'list_languages' => Mcp::Tools::ListLanguages
    }.freeze

    def self.call(tool_name, arguments)
      tool_class = TOOLS[tool_name]
      raise ArgumentError, "Unknown tool: #{tool_name}" unless tool_class

      tool_class.new.call(arguments)
    end

    def self.list_tools
      TOOLS.keys.map do |tool_name|
        tool_class = TOOLS[tool_name]
        tool_class.new.tool_definition
      end
    end
  end
end
