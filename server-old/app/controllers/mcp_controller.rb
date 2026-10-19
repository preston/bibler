# frozen_string_literal: true

# Author: Preston Lee
# MCP Controller for POST requests (JSON-RPC command channel)
# This controller handles regular JSON responses without streaming
class McpController < ApplicationController
  MCP_PROTOCOL_VERSION = '2024-11-05'
  MCP_SERVER_NAME = 'bibler-server'
  MCP_SERVER_VERSION = '1.0.0'

  def handle
    # Read request body first
    body_content = request.body.read
    return render json: jsonrpc_error(-32700, 'Parse error', 'Empty request body'), status: :bad_request if body_content.blank?

    request_body = JSON.parse(body_content)
    method = request_body['method']
    id = request_body['id']
    
    Rails.logger.debug "MCP Request: method=#{method}, id=#{id}"
    
    # For ping, respond immediately without session operations for maximum speed
    if method == 'ping'
      session_id = request.headers['Mcp-Session-Id'] || generate_session_id
      response.headers['Mcp-Session-Id'] = session_id
      response.headers['Content-Type'] = 'application/json'
      Rails.logger.debug "MCP Ping response: id=#{id}, session_id=#{session_id}"
      return render json: {
        jsonrpc: '2.0',
        id: id,
        result: {}
      }
    end
    
    session_id = request.headers['Mcp-Session-Id'] || generate_session_id
    
    # Create session (this should be fast)
    session = Mcp::SessionManager.find_or_create_session(session_id)
    
    # Process request
    jsonrpc_response = process_jsonrpc_request(request_body, session)

    # Set headers and render response
    response.headers['Mcp-Session-Id'] = session.session_id
    response.headers['Content-Type'] = 'application/json'
    Rails.logger.debug "MCP Response: method=#{method}, id=#{id}, session_id=#{session.session_id}"
    render json: jsonrpc_response
  rescue JSON::ParserError => e
    render json: jsonrpc_error(-32700, 'Parse error', e.message), status: :bad_request
  rescue StandardError => e
    Rails.logger.error "MCP Error: #{e.class} - #{e.message}"
    Rails.logger.error e.backtrace.join("\n")
    render json: jsonrpc_error(-32603, 'Internal error', e.message), status: :internal_server_error
  end

  private

  def process_jsonrpc_request(request_body, session)
    method = request_body['method']
    params = request_body['params'] || {}
    id = request_body['id']

    case method
    when 'initialize'
      handle_initialize(params, session, id)
    when 'tools/list'
      handle_tools_list(id)
    when 'tools/call'
      handle_tools_call(params, id)
    else
      jsonrpc_error(-32601, 'Method not found', "Unknown method: #{method}", id)
    end
  end

  def handle_initialize(params, _session, id)
    {
      jsonrpc: '2.0',
      id: id,
      result: {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: {
          tools: {}
        },
        serverInfo: {
          name: MCP_SERVER_NAME,
          version: MCP_SERVER_VERSION
        }
      }
    }
  end

  def handle_tools_list(id)
    {
      jsonrpc: '2.0',
      id: id,
      result: {
        tools: Mcp::ToolHandler.list_tools
      }
    }
  end

  def handle_tools_call(params, id)
    tool_name = params['name']
    arguments = params['arguments'] || {}

    result = Mcp::ToolHandler.call(tool_name, arguments)

    if result[:error]
      jsonrpc_error(-32000, 'Tool execution error', result[:error][:message], id)
    else
      {
        jsonrpc: '2.0',
        id: id,
        result: result
      }
    end
  rescue ArgumentError => e
    jsonrpc_error(-32602, 'Invalid params', e.message, id)
  rescue ActiveRecord::RecordNotFound => e
    jsonrpc_error(-32001, 'Resource not found', e.message, id)
  end

  def jsonrpc_error(code, message, data = nil, id = nil)
    error_response = {
      jsonrpc: '2.0',
      error: {
        code: code,
        message: message
      }
    }
    error_response[:error][:data] = data if data
    error_response[:id] = id if id
    error_response
  end

  def generate_session_id
    SecureRandom.uuid
  end
end
