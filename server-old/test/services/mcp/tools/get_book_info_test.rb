# frozen_string_literal: true

require 'test_helper'

# Author: Preston Lee
class Mcp::Tools::GetBookInfoTest < ActiveSupport::TestCase
  setup do
    @bible = Bible.first
    @book = @bible.books.first
    @tool = Mcp::Tools::GetBookInfo.new
  end

  test 'should return tool definition' do
    definition = @tool.tool_definition
    assert_equal 'get_book_info', definition[:name]
    assert_not_nil definition[:description]
    assert_not_nil definition[:inputSchema]
  end

  test 'should get book info with valid arguments' do
    arguments = {
      'bible' => @bible.uuid,
      'book' => @book.uuid
    }
    result = @tool.call(arguments)
    assert_not_nil result[:content]
    assert_equal 'text', result[:content][0][:type]
    data = JSON.parse(result[:content][0][:text])
    assert_equal @book.name, data['name']
    assert_not_nil data['chapters']
  end

  test 'should require bible parameter' do
    arguments = {
      'book' => @book.uuid
    }
    assert_raises(ArgumentError) do
      @tool.call(arguments)
    end
  end

  test 'should require book parameter' do
    arguments = {
      'bible' => @bible.uuid
    }
    assert_raises(ArgumentError) do
      @tool.call(arguments)
    end
  end

  test 'should handle non-existent book' do
    arguments = {
      'bible' => @bible.uuid,
      'book' => 'non-existent'
    }
    assert_raises(ActiveRecord::RecordNotFound) do
      @tool.call(arguments)
    end
  end
end
