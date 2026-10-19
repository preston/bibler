# frozen_string_literal: true

require 'test_helper'

# Author: Preston Lee
class BiblesControllerTest < ActionDispatch::IntegrationTest
  setup do
    @bible = Bible.first
  end

  test 'should get index' do
    get '/bibles.json'
    assert_response :success
    json = JSON.parse(response.body)
    assert_kind_of Array, json
    assert_operator json.length, :>, 0
  end

  test 'should show bible' do
    get "/bibles/#{@bible.uuid}.json"
    assert_response :success
    json = JSON.parse(response.body)
    assert_equal @bible.uuid, json['uuid']
    assert_equal @bible.name, json['name']
  end
end
