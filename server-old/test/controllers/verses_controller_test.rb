# frozen_string_literal: true

require 'test_helper'

# Author: Preston Lee
class VersesControllerTest < ActionDispatch::IntegrationTest
  setup do
    @bible = Bible.first
    @book = @bible.books.first
    @chapter = 1
    @ordinal = 1
  end

  test 'should get verses for chapter' do
    get "/#{@bible.uuid}/#{@book.uuid}/#{@chapter}.json"
    assert_response :success
    json = JSON.parse(response.body)
    assert_kind_of Array, json
    assert_operator json.length, :>, 0
  end

  test 'should show verse' do
    get "/#{@bible.uuid}/#{@book.uuid}/#{@chapter}/#{@ordinal}.json"
    assert_response :success
    json = JSON.parse(response.body)
    assert_equal @chapter, json['chapter']
    assert_equal @ordinal, json['ordinal']
  end
end
