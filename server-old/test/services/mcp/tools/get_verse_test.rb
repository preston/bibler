# frozen_string_literal: true

require 'test_helper'

# Author: Preston Lee
class Mcp::Tools::GetVerseTest < ActiveSupport::TestCase
  setup do
    @bible = Bible.first
    @book = @bible.books.first
    @verse = Verse.where(bible: @bible, book: @book).first
    @tool = Mcp::Tools::GetVerse.new
  end

  test 'should return tool definition' do
    definition = @tool.tool_definition
    assert_equal 'get_verse', definition[:name]
    assert_not_nil definition[:description]
    assert_not_nil definition[:inputSchema]
  end

  test 'should get verse with valid arguments' do
    arguments = {
      'bible' => @bible.uuid,
      'book' => @book.uuid,
      'chapter' => @verse.chapter,
      'verse' => @verse.ordinal
    }
    result = @tool.call(arguments)
    assert_not_nil result[:content]
    assert_equal 'text', result[:content][0][:type]
    data = JSON.parse(result[:content][0][:text])
    assert_equal @verse.text, data['text']
  end

  test 'should require all parameters' do
    ['bible', 'book', 'chapter', 'verse'].each do |param|
      arguments = {
        'bible' => @bible.uuid,
        'book' => @book.uuid,
        'chapter' => @verse.chapter,
        'verse' => @verse.ordinal
      }
      arguments.delete(param)
      assert_raises(ArgumentError, "Should require #{param}") do
        @tool.call(arguments)
      end
    end
  end

  test 'should handle non-existent verse' do
    arguments = {
      'bible' => @bible.uuid,
      'book' => @book.uuid,
      'chapter' => 999,
      'verse' => 999
    }
    assert_raises(ActiveRecord::RecordNotFound) do
      @tool.call(arguments)
    end
  end

  test 'should handle non-existent bible' do
    arguments = {
      'bible' => 'non-existent',
      'book' => @book.uuid,
      'chapter' => @verse.chapter,
      'verse' => @verse.ordinal
    }
    assert_raises(ActiveRecord::RecordNotFound) do
      @tool.call(arguments)
    end
  end
end
