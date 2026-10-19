# frozen_string_literal: true

# Author: Preston Lee
class Sermon < ApplicationRecord
  include UuidPrimaryKeyAsUuid

  belongs_to :owner, class_name: 'User', foreign_key: :user_id, inverse_of: :sermons
  has_many :sermon_sections, -> { order(:position, :id) }, dependent: :destroy, inverse_of: :sermon

  VISIBILITIES = %w[private sharable public].freeze

  validates :title, presence: true
  validates :visibility, presence: true, inclusion: { in: VISIBILITIES }
end
