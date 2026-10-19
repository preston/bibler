# frozen_string_literal: true

require 'test_helper'

# Author: Preston Lee
class Mcp::ToolHandlerTest < ActiveSupport::TestCase
  setup do
    @bible = Bible.first
  end

  test 'should list all tools' do
    tools = Mcp::ToolHandler.list_tools
    assert_operator tools.length, :>, 0
    tool_names = tools.map { |t| t[:name] }
    assert_includes tool_names, 'search_verses'
    assert_includes tool_names, 'get_verse'
    assert_includes tool_names, 'list_bibles'
  end

  test 'should call search_verses tool' do
    arguments = {
      'bible' => @bible.uuid,
      'query' => 'Lorem'
    }
    result = Mcp::ToolHandler.call('search_verses', arguments)
    assert_not_nil result[:content]
  end

  test 'should call get_verse tool' do
    book = @bible.books.first
    verse = Verse.where(bible: @bible, book: book).first
    arguments = {
      'bible' => @bible.uuid,
      'book' => book.uuid,
      'chapter' => verse.chapter,
      'verse' => verse.ordinal
    }
    result = Mcp::ToolHandler.call('get_verse', arguments)
    assert_not_nil result[:content]
  end

  test 'should raise error for unknown tool' do
    assert_raises(ArgumentError) do
      Mcp::ToolHandler.call('unknown_tool', {})
    end
  end
end
