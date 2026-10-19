# frozen_string_literal: true

# Author: Preston Lee
class StudyCommentary < ApplicationRecord
  include UuidPrimaryKeyAsUuid

  belongs_to :study
  has_many :study_answers, dependent: :nullify

  SOURCE_TYPES = %w[manual ai].freeze

  validates :title, :source_type, presence: true
  validates :source_type, inclusion: { in: SOURCE_TYPES }
  validates :position, numericality: { only_integer: true, greater_than_or_equal_to: 0 }

  scope :ordered, -> { order(:position, :id) }
end
