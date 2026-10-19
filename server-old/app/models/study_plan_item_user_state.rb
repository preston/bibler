# frozen_string_literal: true

class StudyPlanItemUserState < ApplicationRecord
  STATUSES = %w[todo revisit complete].freeze

  belongs_to :user
  belongs_to :study_plan_item

  validates :status, inclusion: { in: STATUSES }
  validates :study_plan_item_id, uniqueness: { scope: :user_id }
end
