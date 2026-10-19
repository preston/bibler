# frozen_string_literal: true

# Author: Preston Lee
# Co-leader membership for a study (study owner is stored on Study#owner_id).
class StudyAssignment < ApplicationRecord
  belongs_to :study
  belongs_to :user

  validates :user_id, uniqueness: { scope: :study_id }
  validate :user_must_not_be_owner

  private

  def user_must_not_be_owner
    return unless study && user_id == study.owner_id

    errors.add(:user_id, 'cannot assign the study owner as a co-leader')
  end
end
