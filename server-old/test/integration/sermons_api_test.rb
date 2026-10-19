# frozen_string_literal: true

require 'test_helper'

class SermonsApiTest < ActionDispatch::IntegrationTest
  test 'GET /sermons.json public scope returns json' do
    get '/sermons.json', params: { scope: 'public' }
    assert_response :success
    body = JSON.parse(response.body)
    assert body.key?('sermons')
  end
end
