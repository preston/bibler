# frozen_string_literal: true

require 'test_helper'

# Author: Preston Lee
class Mcp::SessionManagerTest < ActiveSupport::TestCase
  setup do
    @session_id = SecureRandom.uuid
  end

  test 'should create new session' do
    session = Mcp::SessionManager.find_or_create_session(@session_id)
    assert_not_nil session
    assert_equal @session_id, session.session_id
    assert_not_nil session.initialized_at
    assert_not_nil session.last_activity_at
  end

  test 'should find existing session' do
    session1 = Mcp::SessionManager.find_or_create_session(@session_id)
    old_time = session1.last_activity_at
    sleep 0.1
    session2 = Mcp::SessionManager.find_or_create_session(@session_id)
    assert_equal session1.id, session2.id
    assert session2.last_activity_at > old_time
  end

  test 'should find active session' do
    session = Mcp::SessionManager.find_or_create_session(@session_id)
    found = Mcp::SessionManager.find_session(@session_id)
    assert_not_nil found
    assert_equal session.id, found.id
  end

  test 'should return nil for expired session' do
    session = Mcp::SessionManager.find_or_create_session(@session_id)
    session.update_columns(last_activity_at: 25.hours.ago)
    found = Mcp::SessionManager.find_session(@session_id)
    assert_nil found
  end

  test 'should return nil for non-existent session' do
    found = Mcp::SessionManager.find_session('non-existent-id')
    assert_nil found
  end

  test 'should update last event id' do
    session = Mcp::SessionManager.find_or_create_session(@session_id)
    event_id = SecureRandom.uuid
    updated = Mcp::SessionManager.update_last_event_id(@session_id, event_id)
    assert_not_nil updated
    assert_equal event_id, updated.last_event_id
  end

  test 'should cleanup expired sessions' do
    active = Mcp::SessionManager.find_or_create_session(@session_id)
    expired_id = SecureRandom.uuid
    expired = Mcp::SessionManager.find_or_create_session(expired_id)
    expired.update_columns(last_activity_at: 25.hours.ago)

    Mcp::SessionManager.cleanup_expired

    assert_not McpSession.exists?(expired.id)
    assert McpSession.exists?(active.id)
  end
end
