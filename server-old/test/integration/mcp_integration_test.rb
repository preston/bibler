# frozen_string_literal: true

require 'test_helper'

# Author: Preston Lee
class McpIntegrationTest < ActionDispatch::IntegrationTest
  setup do
    @bible = Bible.first
    @book = @bible.books.first
    @verse = Verse.where(bible: @bible, book: @book).first
    @session_id = nil
  end

  test 'should complete full MCP flow' do
    # Step 1: Initialize
    post '/mcp', params: {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {}
    }.to_json, headers: { 'Content-Type' => 'application/json' }

    assert_response :success
    json = JSON.parse(response.body)
    assert_equal '2.0', json['jsonrpc']
    @session_id = response.headers['Mcp-Session-Id']
    assert_not_nil @session_id

    # Step 2: List tools
    post '/mcp', params: {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: {}
    }.to_json, headers: {
      'Content-Type' => 'application/json',
      'Mcp-Session-Id' => @session_id
    }

    assert_response :success
    json = JSON.parse(response.body)
    tools = json['result']['tools']
    assert_operator tools.length, :>, 0

    # Step 3: Call a tool
    post '/mcp', params: {
      jsonrpc: '2.0',
      id: 3,
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
    }.to_json, headers: {
      'Content-Type' => 'application/json',
      'Mcp-Session-Id' => @session_id
    }

    assert_response :success
    json = JSON.parse(response.body)
    assert_not_nil json['result']
    assert_not_nil json['result']['content']
  end

  test 'should persist session across requests' do
    # First request
    post '/mcp', params: {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {}
    }.to_json, headers: { 'Content-Type' => 'application/json' }

    session_id = response.headers['Mcp-Session-Id']
    assert_not_nil session_id

    # Second request with same session
    post '/mcp', params: {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: {}
    }.to_json, headers: {
      'Content-Type' => 'application/json',
      'Mcp-Session-Id' => session_id
    }

    assert_response :success
    assert_equal session_id, response.headers['Mcp-Session-Id']

    # Verify session exists in database
    session = McpSession.find_by(session_id: session_id)
    assert_not_nil session
    assert_not session.expired?
  end

  test 'should handle multiple concurrent sessions' do
    session_ids = []

    3.times do |i|
      post '/mcp', params: {
        jsonrpc: '2.0',
        id: i + 1,
        method: 'initialize',
        params: {}
      }.to_json, headers: { 'Content-Type' => 'application/json' }

      session_id = response.headers['Mcp-Session-Id']
      session_ids << session_id
    end

    # All sessions should be unique
    assert_equal 3, session_ids.uniq.length

    # All sessions should exist in database
    session_ids.each do |sid|
      assert_not_nil McpSession.find_by(session_id: sid)
    end
  end

  test 'should verify data consistency with REST API' do
    # Get verse via MCP
    post '/mcp', params: {
      jsonrpc: '2.0',
      id: 1,
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

    mcp_json = JSON.parse(response.body)
    mcp_data = JSON.parse(mcp_json['result']['content'][0]['text'])

    # Get verse via REST API
    get "/#{@bible.uuid}/#{@book.uuid}/#{@verse.chapter}/#{@verse.ordinal}.json"
    rest_json = JSON.parse(response.body)

    # Verify data matches
    assert_equal rest_json['text'], mcp_data['text']
    assert_equal rest_json['chapter'], mcp_data['chapter']
    assert_equal rest_json['ordinal'], mcp_data['verse']
  end
end
