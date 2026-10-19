# frozen_string_literal: true

# Author: Preston Lee
# MCP Stream Controller for GET requests (SSE announcement channel)
# This controller handles Server-Sent Events streaming
class McpStreamController < ApplicationController
  include ActionController::Live
  KEEPALIVE_INTERVAL_SECONDS = 10
  MAX_STREAM_SECONDS = 300
  SESSION_ID_PATTERN = /\A[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\z/i

  def stream
    # MCP HTTP Stream Transport: GET requests establish SSE announcement channel
    # This is a long-lived connection for server-initiated events
    session_id = normalized_session_id
    return if performed?
    session = Mcp::SessionManager.find_or_create_session(session_id)
    stream_started_at = Process.clock_gettime(Process::CLOCK_MONOTONIC)

    response.headers['Mcp-Session-Id'] = session.session_id
    response.headers['Content-Type'] = 'text/event-stream'
    response.headers['Cache-Control'] = 'no-cache'
    response.headers['Connection'] = 'keep-alive'
    response.headers['X-Accel-Buffering'] = 'no' # Disable nginx buffering if present

    # Send initial connection event immediately
    response.stream.write("event: connected\n")
    response.stream.write("data: {\"session_id\":\"#{session.session_id}\"}\n\n")

    # Keep connection alive with periodic keepalive messages
    # MCP spec recommends keeping this connection open for announcements
    # Use bounded lifetime to avoid exhausting ActionController::Live threads.
    begin
      loop do
        elapsed = Process.clock_gettime(Process::CLOCK_MONOTONIC) - stream_started_at
        break if elapsed >= MAX_STREAM_SECONDS
        sleep KEEPALIVE_INTERVAL_SECONDS
        response.stream.write(": keepalive\n\n")
      end
    rescue ActionController::Live::ClientDisconnected
      # Client disconnected, close gracefully
      Rails.logger.info "MCP SSE client disconnected: #{session_id}"
    ensure
      elapsed_ms = ((Process.clock_gettime(Process::CLOCK_MONOTONIC) - stream_started_at) * 1000).round
      Rails.logger.info("MCP SSE stream closed session_id=#{session_id} elapsed_ms=#{elapsed_ms}")
      response.stream.close
    end
  end

  private

  def generate_session_id
    SecureRandom.uuid
  end

  def normalized_session_id
    raw = request.headers['Mcp-Session-Id'].to_s.strip
    return generate_session_id if raw.blank?
    return raw if raw.match?(SESSION_ID_PATTERN)

    render json: { error: 'Invalid Mcp-Session-Id format.' }, status: :bad_request
    nil
  end
end
