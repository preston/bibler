# frozen_string_literal: true

require 'test_helper'

# Author: Preston Lee
class Mcp::Tools::ListBooksTest < ActiveSupport::TestCase
  setup do
    @bible = Bible.first
    @tool = Mcp::Tools::ListBooks.new
  end

  test 'should return tool definition' do
    definition = @tool.tool_definition
    assert_equal 'list_books', definition[:name]
    assert_not_nil definition[:description]
    assert_not_nil definition[:inputSchema]
  end

  test 'should list books for specific bible' do
    arguments = {
      'bible' => @bible.uuid
    }
    result = @tool.call(arguments)
    assert_not_nil result[:content]
    data = JSON.parse(result[:content][0][:text])
    assert data.is_a?(Array)
    assert data.all? { |book| book['bible'] == @bible.name }
  end

  test 'should list all books when bible not specified' do
    arguments = {}
    result = @tool.call(arguments)
    assert_not_nil result[:content]
    data = JSON.parse(result[:content][0][:text])
    assert data.is_a?(Array)
    assert_operator data.length, :>, 0
  end

  test 'should handle non-existent bible' do
    arguments = {
      'bible' => 'non-existent'
    }
    assert_raises(ActiveRecord::RecordNotFound) do
      @tool.call(arguments)
    end
  end
end
