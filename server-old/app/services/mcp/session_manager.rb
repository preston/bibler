# frozen_string_literal: true

# Author: Preston Lee
module Mcp
  class SessionManager
    def self.find_or_create_session(session_id)
      session = McpSession.find_or_initialize_by(session_id: session_id)
      
      if session.new_record?
        session.initialized_at = Time.current
        session.last_activity_at = Time.current
        session.save!
      else
        session.touch_activity!
      end
      
      session
    end

    def self.find_session(session_id)
      session = McpSession.find_by(session_id: session_id)
      return nil unless session
      return nil if session.expired?
      
      session.touch_activity!
      session
    end

    def self.update_last_event_id(session_id, event_id)
      session = find_session(session_id)
      return unless session
      
      session.update_column(:last_event_id, event_id)
      session
    end

    def self.cleanup_expired
      McpSession.cleanup_expired!
    end
  end
end
