# frozen_string_literal: true

require 'test_helper'

# Author: Preston Lee
class BooksControllerTest < ActionDispatch::IntegrationTest
  setup do
    @bible = Bible.first
    @book = Book.first
  end

  test 'should get index' do
    get '/books.json'
    assert_response :success
    json = JSON.parse(response.body)
    assert_kind_of Array, json
  end

  test 'should show book' do
    get "/books/#{@book.uuid}.json"
    assert_response :success
    json = JSON.parse(response.body)
    assert_equal @book.uuid, json['uuid']
    assert_equal @book.name, json['name']
  end
end
