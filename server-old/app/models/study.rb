# frozen_string_literal: true

# Author: Preston Lee
class Study < ApplicationRecord
  include UuidPrimaryKeyAsUuid

  has_many :study_verses, dependent: :destroy
  has_many :study_commentaries, dependent: :destroy
  has_many :study_questions, dependent: :destroy
  has_many :study_tasks, dependent: :destroy
  has_many :study_answers, dependent: :destroy
  has_many :study_plan_items, dependent: :destroy
  has_many :study_assignments, dependent: :destroy
  belongs_to :owner, class_name: 'User', optional: true

  VISIBILITIES = %w[private sharable public].freeze
  MODES = %w[leader co-leader participant].freeze

  validates :title, presence: true
  validates :visibility, presence: true, inclusion: { in: VISIBILITIES }

  def co_led_by?(user)
    user && study_assignments.exists?(user_id: user.id)
  end

  # Which collaboration labels the UI may offer (not sent as a request header; RBAC decides real access).
  def available_study_modes_for(user)
    return %w[participant] unless user

    perms = user.effective_permissions || {}
    return MODES.dup if perms[:administrator]
    return %w[leader participant] if perms[:curation]
    return %w[leader participant] if owner_id == user.id
    return %w[co-leader participant] if co_led_by?(user)

    %w[participant]
  end

  def my_study_role_for(user)
    return 'participant' unless user

    perms = user.effective_permissions || {}
    return 'curator' if perms[:curation] && owner_id != user.id && !co_led_by?(user)
    return 'owner' if owner_id == user.id
    return 'co_leader' if co_led_by?(user)

    'participant'
  end

  # Effective collaboration capabilities for the current viewer (RBAC + membership).
  def capabilities_for_viewer(user)
    capabilities_for(effective_capability_mode_for(user))
  end

  def effective_capability_mode_for(user)
    return 'participant' unless user

    perms = user.effective_permissions || {}
    return 'leader' if perms[:administrator] || perms[:curation]
    return 'leader' if owner_id == user.id
    return 'co-leader' if co_led_by?(user)

    'participant'
  end

  def capabilities_for(mode)
    normalized_mode = MODES.include?(mode) ? mode : 'participant'
    {
      mode: normalized_mode,
      can_edit_structure: %w[leader co-leader].include?(normalized_mode),
      can_manage_tasks: %w[leader co-leader].include?(normalized_mode),
      can_reorder_content: %w[leader co-leader].include?(normalized_mode),
      can_delete_content: %w[leader co-leader].include?(normalized_mode),
      can_answer_questions: true,
      can_delete_study: normalized_mode == 'leader'
    }
  end

  # Per-study Bible selection was removed; scripture context uses system AI default Bibles only.
  def selected_bible_uuids
    []
  end

end
