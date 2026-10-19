# frozen_string_literal: true

# Author: Preston Lee
class McpSession < ApplicationRecord
  validates_presence_of :session_id
  validates_uniqueness_of :session_id

  # Default TTL is 24 hours
  DEFAULT_TTL = 24.hours

  scope :expired, -> { where('last_activity_at < ?', DEFAULT_TTL.ago) }
  scope :active, -> { where('last_activity_at >= ?', DEFAULT_TTL.ago) }

  def expired?
    last_activity_at < DEFAULT_TTL.ago
  end

  def touch_activity!
    update_column(:last_activity_at, Time.current)
  end

  def self.cleanup_expired!
    expired.delete_all
  end
end
