# frozen_string_literal: true

require 'test_helper'

# Author: Preston Lee
class Mcp::Tools::GetChapterTest < ActiveSupport::TestCase
  setup do
    @bible = Bible.first
    @book = @bible.books.first
    @chapter = 1
    @tool = Mcp::Tools::GetChapter.new
  end

  test 'should return tool definition' do
    definition = @tool.tool_definition
    assert_equal 'get_chapter', definition[:name]
    assert_not_nil definition[:description]
    assert_not_nil definition[:inputSchema]
  end

  test 'should get chapter with valid arguments' do
    arguments = {
      'bible' => @bible.uuid,
      'book' => @book.uuid,
      'chapter' => @chapter
    }
    result = @tool.call(arguments)
    assert_not_nil result[:content]
    assert_equal 'text', result[:content][0][:type]
    data = JSON.parse(result[:content][0][:text])
    assert_not_nil data['verses']
  end

  test 'should require all parameters' do
    ['bible', 'book', 'chapter'].each do |param|
      arguments = {
        'bible' => @bible.uuid,
        'book' => @book.uuid,
        'chapter' => @chapter
      }
      arguments.delete(param)
      assert_raises(ArgumentError, "Should require #{param}") do
        @tool.call(arguments)
      end
    end
  end

  test 'should handle non-existent chapter' do
    arguments = {
      'bible' => @bible.uuid,
      'book' => @book.uuid,
      'chapter' => 999
    }
    result = @tool.call(arguments)
    # Should return empty verses array, not error
    assert_not_nil result[:content]
    data = JSON.parse(result[:content][0][:text])
    assert_equal [], data['verses']
  end
end
