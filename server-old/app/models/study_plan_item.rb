# frozen_string_literal: true

class StudyPlanItem < ApplicationRecord
  include UuidPrimaryKeyAsUuid

  belongs_to :study
  has_many :study_plan_item_user_states, dependent: :destroy

  ITEM_TYPES = %w[verse commentary question task custom worship].freeze
  DEFAULT_DURATIONS_BY_TYPE = {
    'verse' => 2,
    'question' => 7,
    'commentary' => 5,
    'task' => 5,
    'custom' => 5,
    'worship' => 5
  }.freeze
  RESOURCE_TYPES = %w[study_verse study_commentary study_question study_task].freeze
  ITEM_TYPE_TO_RESOURCE_TYPE = {
    'verse' => 'study_verse',
    'commentary' => 'study_commentary',
    'question' => 'study_question',
    'task' => 'study_task'
  }.freeze

  before_validation :apply_default_duration, on: :create
  before_validation :ensure_position_default
  scope :ordered, -> { order(:position, :created_at) }

  validates :title, presence: true
  validates :item_type, presence: true, inclusion: { in: ITEM_TYPES }
  validates :position, presence: true
  validates :duration, numericality: { only_integer: true, greater_than_or_equal_to: 0 }, allow_nil: true
  validates :resource_type, inclusion: { in: RESOURCE_TYPES }, allow_nil: true
  validate :resource_reference_consistency

  def effective_duration
    return nil if duration.to_i <= 0

    duration
  end

  private

  def ensure_position_default
    self.position = 0 if position.nil?
  end

  def apply_default_duration
    return unless duration.nil?

    self.duration = DEFAULT_DURATIONS_BY_TYPE[item_type]
  end

  def resource_reference_consistency
    return if resource_type.blank? && resource_uuid.blank?

    expected_resource = ITEM_TYPE_TO_RESOURCE_TYPE[item_type]
    if expected_resource.nil?
      if resource_type.present? || resource_uuid.present?
        errors.add(:resource_type, 'must be empty for this item type')
      end
      return
    end

    if resource_type != expected_resource
      errors.add(:resource_type, "must be #{expected_resource} for item_type=#{item_type}")
    end
    errors.add(:resource_uuid, 'must be present when resource_type is set') if resource_uuid.blank?
  end

end
