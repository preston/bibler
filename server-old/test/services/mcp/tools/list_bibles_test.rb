# frozen_string_literal: true

require 'test_helper'

# Author: Preston Lee
class Mcp::Tools::ListBiblesTest < ActiveSupport::TestCase
  setup do
    @tool = Mcp::Tools::ListBibles.new
  end

  test 'should return tool definition' do
    definition = @tool.tool_definition
    assert_equal 'list_bibles', definition[:name]
    assert_not_nil definition[:description]
    assert_not_nil definition[:inputSchema]
  end

  test 'should list all bibles' do
    arguments = {}
    result = @tool.call(arguments)
    assert_not_nil result[:content]
    data = JSON.parse(result[:content][0][:text])
    assert data.is_a?(Array)
    assert_operator data.length, :>, 0
  end

  test 'should filter by language' do
    arguments = {
      'language' => 'en'
    }
    result = @tool.call(arguments)
    assert_not_nil result[:content]
    data = JSON.parse(result[:content][0][:text])
    assert data.is_a?(Array)
    assert data.all? { |bible| bible['language'] == 'en' }
  end

  test 'should return empty array for non-existent language' do
    arguments = {
      'language' => 'xx'
    }
    result = @tool.call(arguments)
    assert_not_nil result[:content]
    data = JSON.parse(result[:content][0][:text])
    assert_equal [], data
  end
end
