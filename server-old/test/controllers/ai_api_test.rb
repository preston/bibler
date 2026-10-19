# frozen_string_literal: true

require 'test_helper'

# Author: Preston Lee
class AiApiTest < ActionDispatch::IntegrationTest
  setup do
    @study = studies(:one)
    @auth_one = { 'Authorization' => "Bearer #{users(:one).api_token}" }
  end

  test 'health reports unconfigured when ollama url missing' do
    previous = ENV['BIBLER_SERVER_OLLAMA_URL']
    ENV['BIBLER_SERVER_OLLAMA_URL'] = nil
    get '/ai/health'
    assert_response :success
    body = JSON.parse(response.body)
    assert_equal 'unconfigured', body['status']
  ensure
    ENV['BIBLER_SERVER_OLLAMA_URL'] = previous
  end

  test 'chat returns service error when ollama url missing' do
    previous = ENV['BIBLER_SERVER_OLLAMA_URL']
    ENV['BIBLER_SERVER_OLLAMA_URL'] = nil
    post '/ai/chat', params: { prompt: 'test prompt' }
    assert_response :unprocessable_entity
    body = JSON.parse(response.body)
    assert_match(/BIBLER_SERVER_OLLAMA_URL/, body['error'])
  ensure
    ENV['BIBLER_SERVER_OLLAMA_URL'] = previous
  end

  test 'study ai route returns structured error when unconfigured' do
    previous = ENV['BIBLER_SERVER_OLLAMA_URL']
    ENV['BIBLER_SERVER_OLLAMA_URL'] = nil
    post "/studies/#{@study.uuid}/ai/summarize", params: { prompt: 'summarize' }, headers: @auth_one
    assert_response :unprocessable_entity
    body = JSON.parse(response.body)
    assert body['error'].present?
  ensure
    ENV['BIBLER_SERVER_OLLAMA_URL'] = previous
  end

  test 'comparator_commentary returns service error when ollama url missing' do
    previous = ENV['BIBLER_SERVER_OLLAMA_URL']
    ENV['BIBLER_SERVER_OLLAMA_URL'] = nil
    post '/ai/comparator_commentary',
         params: {
           primary_bible_uuid: '00000000-0000-0000-0000-000000000101',
           secondary_bible_uuid: '00000000-0000-0000-0000-000000000102',
           primary_book_uuid: '00000000-0000-0000-0000-000000000201',
           secondary_book_uuid: '00000000-0000-0000-0000-000000000202',
           chapter: 1
         },
         as: :json
    assert_response :unprocessable_entity
    body = JSON.parse(response.body)
    assert_match(/BIBLER_SERVER_OLLAMA_URL/, body['error'])
  ensure
    ENV['BIBLER_SERVER_OLLAMA_URL'] = previous
  end

  test 'comparator_commentary returns 422 when bible uuid unknown' do
    post '/ai/comparator_commentary',
         params: {
           primary_bible_uuid: '00000000-0000-0000-0000-00000000dead',
           secondary_bible_uuid: '00000000-0000-0000-0000-000000000102',
           primary_book_uuid: '00000000-0000-0000-0000-000000000201',
           secondary_book_uuid: '00000000-0000-0000-0000-000000000202',
           chapter: 1
         },
         as: :json
    assert_response :unprocessable_entity
    body = JSON.parse(response.body)
    assert_match(/Unknown primary or secondary Bible/, body['error'])
  end

  test 'comparator_commentary returns 422 when chapter has no verses in database' do
    post '/ai/comparator_commentary',
         params: {
           primary_bible_uuid: '00000000-0000-0000-0000-000000000101',
           secondary_bible_uuid: '00000000-0000-0000-0000-000000000102',
           primary_book_uuid: '00000000-0000-0000-0000-000000000201',
           secondary_book_uuid: '00000000-0000-0000-0000-000000000202',
           chapter: 2
         },
         as: :json
    assert_response :unprocessable_entity
    body = JSON.parse(response.body)
    assert_match(/No verses found/, body['error'])
  end

  test 'comparator_commentary returns 422 when chapter is not positive' do
    post '/ai/comparator_commentary',
         params: {
           primary_bible_uuid: '00000000-0000-0000-0000-000000000101',
           secondary_bible_uuid: '00000000-0000-0000-0000-000000000102',
           primary_book_uuid: '00000000-0000-0000-0000-000000000201',
           secondary_book_uuid: '00000000-0000-0000-0000-000000000202',
           chapter: 0
         },
         as: :json
    assert_response :unprocessable_entity
    body = JSON.parse(response.body)
    assert_match(/Chapter must be a positive integer/, body['error'])
  end
end
