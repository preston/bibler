# frozen_string_literal: true

require 'test_helper'

# Author: Preston Lee
class McpControllerTest < ActionDispatch::IntegrationTest
  setup do
    @bible = Bible.first
    @book = @bible.books.first
    @verse = Verse.where(bible: @bible, book: @book).first
  end

  test 'should handle initialize request' do
    post '/mcp', params: {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {}
    }.to_json, headers: { 'Content-Type' => 'application/json' }

    assert_response :success
    json = JSON.parse(response.body)
    assert_equal '2.0', json['jsonrpc']
    assert_equal 1, json['id']
    assert_not_nil json['result']
    assert_not_nil json['result']['protocolVersion']
    assert_not_nil json['result']['serverInfo']
  end

  test 'should handle tools/list request' do
    post '/mcp', params: {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: {}
    }.to_json, headers: { 'Content-Type' => 'application/json' }

    assert_response :success
    json = JSON.parse(response.body)
    assert_equal '2.0', json['jsonrpc']
    assert_not_nil json['result']
    assert_not_nil json['result']['tools']
    assert_operator json['result']['tools'].length, :>, 0
  end

  test 'should handle tools/call request for search_verses' do
    post '/mcp', params: {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'search_verses',
        arguments: {
          bible: @bible.uuid,
          query: 'Lorem'
        }
      }
    }.to_json, headers: { 'Content-Type' => 'application/json' }

    assert_response :success
    json = JSON.parse(response.body)
    assert_equal '2.0', json['jsonrpc']
    assert_not_nil json['result']
    assert_not_nil json['result']['content']
  end

  test 'should handle tools/call request for get_verse' do
    post '/mcp', params: {
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: {
        name: 'get_verse',
        arguments: {
          bible: @bible.uuid,
          book: @book.uuid,
          chapter: @verse.chapter,
          verse: @verse.ordinal
        }
      }
    }.to_json, headers: { 'Content-Type' => 'application/json' }

    assert_response :success
    json = JSON.parse(response.body)
    assert_equal '2.0', json['jsonrpc']
    assert_not_nil json['result']
  end

  test 'should return error for unknown method' do
    post '/mcp', params: {
      jsonrpc: '2.0',
      id: 5,
      method: 'unknown_method',
      params: {}
    }.to_json, headers: { 'Content-Type' => 'application/json' }

    assert_response :success
    json = JSON.parse(response.body)
    assert_not_nil json['error']
    assert_equal(-32601, json['error']['code'])
  end

  test 'should return error for invalid JSON' do
    post '/mcp', params: 'invalid json', headers: { 'Content-Type' => 'application/json' }
    assert_response :bad_request
    json = JSON.parse(response.body)
    assert_not_nil json['error']
    assert_equal(-32700, json['error']['code'])
  end

  test 'should include session id in response headers' do
    post '/mcp', params: {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {}
    }.to_json, headers: { 'Content-Type' => 'application/json' }

    assert_response :success
    assert_not_nil response.headers['Mcp-Session-Id']
  end

  test 'should use provided session id' do
    session_id = SecureRandom.uuid
    post '/mcp', params: {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {}
    }.to_json, headers: {
      'Content-Type' => 'application/json',
      'Mcp-Session-Id' => session_id
    }

    assert_response :success
    assert_equal session_id, response.headers['Mcp-Session-Id']
  end

  test 'should return error for invalid tool arguments' do
    post '/mcp', params: {
      jsonrpc: '2.0',
      id: 6,
      method: 'tools/call',
      params: {
        name: 'search_verses',
        arguments: {}
      }
    }.to_json, headers: { 'Content-Type' => 'application/json' }

    assert_response :success
    json = JSON.parse(response.body)
    assert_not_nil json['error']
    assert_equal(-32602, json['error']['code'])
  end

  test 'should handle ping request' do
    post '/mcp', params: {
      jsonrpc: '2.0',
      id: 7,
      method: 'ping',
      params: {}
    }.to_json, headers: { 'Content-Type' => 'application/json' }

    assert_response :success
    json = JSON.parse(response.body)
    assert_equal '2.0', json['jsonrpc']
    assert_equal 7, json['id']
    assert_not_nil json['result']
    assert_equal({}, json['result'])
  end

  test 'should handle ping without session operations for speed' do
    # Ping is optimized to skip session operations for maximum speed
    post '/mcp', params: {
      jsonrpc: '2.0',
      id: 8,
      method: 'ping',
      params: {}
    }.to_json, headers: {
      'Content-Type' => 'application/json'
    }

    assert_response :success
    json = JSON.parse(response.body)
    assert_equal '2.0', json['jsonrpc']
    assert_equal 8, json['id']
    assert_not_nil json['result']
    assert_equal({}, json['result'])
    # Should still return a session ID in headers
    assert_not_nil response.headers['Mcp-Session-Id']
  end
end
