# frozen_string_literal: true

require 'test_helper'

# Author: Preston Lee
class Mcp::Tools::ListLanguagesTest < ActiveSupport::TestCase
  setup do
    @tool = Mcp::Tools::ListLanguages.new
  end

  test 'should return tool definition' do
    definition = @tool.tool_definition
    assert_equal 'list_languages', definition[:name]
    assert_not_nil definition[:description]
    assert_not_nil definition[:inputSchema]
  end

  test 'should list all languages' do
    arguments = {}
    result = @tool.call(arguments)
    assert_not_nil result[:content]
    data = JSON.parse(result[:content][0][:text])
    assert data.is_a?(Array)
    assert_operator data.length, :>, 0
  end

  test 'should return language codes and names' do
    arguments = {}
    result = @tool.call(arguments)
    data = JSON.parse(result[:content][0][:text])
    
    data.each do |lang|
      assert_not_nil lang['code']
      assert_not_nil lang['name']
      assert lang['code'].is_a?(String)
      assert lang['name'].is_a?(String)
    end
  end

  test 'should include known language names' do
    arguments = {}
    result = @tool.call(arguments)
    data = JSON.parse(result[:content][0][:text])
    
    # Check that languages in the database have proper names
    # At least one language should have a mapped name
    languages_with_names = data.select { |lang| Bible::LANGUAGE_NAMES.key?(lang['code']) }
    assert_operator languages_with_names.length, :>, 0, 'At least one language should have a mapped name'
    
    # Verify that mapped languages have correct names
    languages_with_names.each do |lang|
      expected_name = Bible::LANGUAGE_NAMES[lang['code']]
      assert_equal expected_name, lang['name'], "Language #{lang['code']} should have name #{expected_name}"
    end
  end

  test 'should return unique language codes' do
    arguments = {}
    result = @tool.call(arguments)
    data = JSON.parse(result[:content][0][:text])
    
    codes = data.map { |lang| lang['code'] }
    assert_equal codes.length, codes.uniq.length, 'Language codes should be unique'
  end
end
