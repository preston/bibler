# frozen_string_literal: true

class User < ApplicationRecord
  devise :database_authenticatable, :recoverable, :rememberable, :validatable

  has_and_belongs_to_many :roles, join_table: :roles_users
  has_many :study_answers, dependent: :nullify
  has_many :study_plan_item_user_states, dependent: :destroy
  has_many :study_assignments, dependent: :destroy
  has_many :co_led_studies, through: :study_assignments, source: :study
  has_many :sermons, foreign_key: :user_id, dependent: :destroy, inverse_of: :owner
  has_many :documents, dependent: :destroy

  has_secure_token :api_token

  validates :username, presence: true, uniqueness: { case_sensitive: false }
  validates :name, presence: true

  # Devise uses this for authentication (see config/initializers/devise.rb).
  def self.find_for_database_authentication(conditions)
    conditions = conditions.dup
    login = conditions.delete(:username)
    where(conditions).where(['lower(username) = :value', { value: login.downcase }]).first
  end

  def email_required?
    true
  end

  # Aggregated permission flags (OR across roles). Administrator implies all.
  def effective_permissions
    if roles.any?(&:administrator?)
      return { administrator: true, bibles: true, access: true, curation: true }
    end

    {
      administrator: false,
      bibles: roles.any?(&:bibles),
      access: roles.any?(&:access),
      curation: roles.any?(&:curation)
    }
  end

  def apply_default_roles!
    Role.where(is_default: true).find_each do |role|
      roles << role unless roles.include?(role)
    end
  end
end
