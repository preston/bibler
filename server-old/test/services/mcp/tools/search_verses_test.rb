# frozen_string_literal: true

require 'test_helper'

# Author: Preston Lee
class Mcp::Tools::SearchVersesTest < ActiveSupport::TestCase
  setup do
    @bible = Bible.first
    @tool = Mcp::Tools::SearchVerses.new
  end

  test 'should return tool definition' do
    definition = @tool.tool_definition
    assert_equal 'search_verses', definition[:name]
    assert_not_nil definition[:description]
    assert_not_nil definition[:inputSchema]
  end

  test 'should search verses with valid arguments' do
    arguments = {
      'bible' => @bible.uuid,
      'query' => 'Lorem'
    }
    result = @tool.call(arguments)
    assert_not_nil result[:content]
    assert_equal 'text', result[:content][0][:type]
  end

  test 'should require bible parameter' do
    arguments = {
      'query' => 'test'
    }
    assert_raises(ArgumentError) do
      @tool.call(arguments)
    end
  end

  test 'should require query parameter' do
    arguments = {
      'bible' => @bible.uuid
    }
    assert_raises(ArgumentError) do
      @tool.call(arguments)
    end
  end

  test 'should respect limit parameter' do
    arguments = {
      'bible' => @bible.uuid,
      'query' => 'Lorem',
      'limit' => 1
    }
    result = @tool.call(arguments)
    data = JSON.parse(result[:content][0][:text])
    assert_operator data.length, :<=, 1
  end

  test 'should handle non-existent bible' do
    arguments = {
      'bible' => 'non-existent',
      'query' => 'test'
    }
    assert_raises(ActiveRecord::RecordNotFound) do
      @tool.call(arguments)
    end
  end
end
