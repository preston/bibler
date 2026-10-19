# frozen_string_literal: true

# Author: Preston Lee
class StudyTask < ApplicationRecord
  include UuidPrimaryKeyAsUuid

  belongs_to :study

  TASK_TYPES = %w[discussion reading prayer memorization reflection create].freeze
  STATUSES = %w[open in_progress completed archived].freeze

  validates :instruction, :task_type, :status, presence: true
  validates :task_type, inclusion: { in: TASK_TYPES }
  validates :status, inclusion: { in: STATUSES }
  validates :position, numericality: { only_integer: true, greater_than_or_equal_to: 0 }

  scope :ordered, -> { order(:position, :id) }
end
