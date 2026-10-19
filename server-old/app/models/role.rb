# frozen_string_literal: true

class Role < ApplicationRecord
  has_and_belongs_to_many :users, join_table: :roles_users

  validates :name, presence: true, uniqueness: true
end
