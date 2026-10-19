# frozen_string_literal: true

require 'test_helper'

# Author: Preston Lee
class McpSessionTest < ActiveSupport::TestCase
  setup do
    @session = McpSession.create!(
      session_id: SecureRandom.uuid,
      initialized_at: Time.current,
      last_activity_at: Time.current
    )
  end

  test 'should create session with valid attributes' do
    session = McpSession.new(
      session_id: SecureRandom.uuid,
      initialized_at: Time.current,
      last_activity_at: Time.current
    )
    assert session.valid?
  end

  test 'should require session_id' do
    session = McpSession.new(
      initialized_at: Time.current,
      last_activity_at: Time.current
    )
    assert_not session.valid?
    assert_includes session.errors[:session_id], "can't be blank"
  end

  test 'should require unique session_id' do
    duplicate = McpSession.new(
      session_id: @session.session_id,
      initialized_at: Time.current,
      last_activity_at: Time.current
    )
    assert_not duplicate.valid?
    assert_includes duplicate.errors[:session_id], 'has already been taken'
  end

  test 'should identify expired sessions' do
    expired_session = McpSession.create!(
      session_id: SecureRandom.uuid,
      initialized_at: 25.hours.ago,
      last_activity_at: 25.hours.ago
    )
    assert expired_session.expired?
    assert_not @session.expired?
  end

  test 'should touch activity timestamp' do
    old_time = @session.last_activity_at
    sleep 0.1
    @session.touch_activity!
    assert @session.last_activity_at > old_time
  end

  test 'should scope expired sessions' do
    expired = McpSession.create!(
      session_id: SecureRandom.uuid,
      initialized_at: 25.hours.ago,
      last_activity_at: 25.hours.ago
    )
    assert_includes McpSession.expired, expired
    assert_not_includes McpSession.expired, @session
  end

  test 'should scope active sessions' do
    expired = McpSession.create!(
      session_id: SecureRandom.uuid,
      initialized_at: 25.hours.ago,
      last_activity_at: 25.hours.ago
    )
    assert_includes McpSession.active, @session
    assert_not_includes McpSession.active, expired
  end

  test 'should cleanup expired sessions' do
    expired = McpSession.create!(
      session_id: SecureRandom.uuid,
      initialized_at: 25.hours.ago,
      last_activity_at: 25.hours.ago
    )
    McpSession.cleanup_expired!
    assert_not McpSession.exists?(expired.id)
    assert McpSession.exists?(@session.id)
  end
end
