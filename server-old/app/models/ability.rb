# frozen_string_literal: true

class Ability
  include CanCan::Ability

  STUDY_NESTED = [StudyVerse, StudyCommentary, StudyQuestion, StudyTask, StudyPlanItem].freeze
  SERMON_NESTED = [SermonSection, SermonSectionVerse].freeze

  def initialize(principal)
    if principal.is_a?(User)
      apply_user_rbac(principal)
      return if principal.effective_permissions[:administrator]

      apply_study_abilities_for_user(principal)
    else
      apply_guest_study_abilities
    end
  end

  private

  def apply_user_rbac(user)
    perms = user.effective_permissions
    return unless perms

    if perms[:administrator]
      can :manage, :all
      return
    end

    can :manage, Role if perms[:access]
    can :manage, User if perms[:access]
    can :read, Role if perms[:access]
    can :read, User if perms[:access]
    can :manage, :system_ai_settings if perms[:bibles]
    can :read, :system_ai_settings if perms[:bibles]

    apply_sermon_abilities_for_user(user)
    apply_document_abilities_for_user(user)
  end

  def apply_study_abilities_for_user(user)
    perms = user.effective_permissions || {}

    can :read, Study do |study|
      study_readable_by_user?(study, user, perms)
    end

    STUDY_NESTED.each do |klass|
      can :read, klass do |obj|
        study_readable_by_user?(obj.study, user, perms)
      end
    end

    can :read, StudyAnswer do |answer|
      st = answer.study_question&.study
      st ? study_readable_by_user?(st, user, perms) : false
    end

    # Top-level POST /studies passes the Study class; nested creates pass a persisted study.
    can :create, Study do |subject|
      if subject.is_a?(Class)
        true
      elsif subject.is_a?(Study) && !subject.persisted?
        true
      elsif subject.is_a?(Study)
        study_editable_by_user?(subject, user, perms)
      else
        false
      end
    end

    can :update, Study do |study|
      study_editable_by_user?(study, user, perms)
    end

    # Nested controllers (verses, tasks, …) authorize :destroy on the parent study — editors may remove content.
    can :destroy, Study do |study|
      study_editable_by_user?(study, user, perms)
    end

    # Whole-study delete (StudiesController#destroy): owner or curator only — not co-leaders.
    can :destroy_study, Study do |study|
      study&.owner_id == user.id || perms[:curation]
    end

    can :transfer_ownership, Study do |study|
      study&.owner_id == user.id || perms[:curation]
    end

    can :manage_study_access, Study do |study|
      study_editable_by_user?(study, user, perms)
    end

    STUDY_NESTED.each do |klass|
      can %i[create update destroy], klass do |obj|
        st = obj.try(:study) || obj&.study
        st && study_editable_by_user?(st, user, perms)
      end
    end

    can :create, StudyAnswer do |answer|
      st = answer.study_question&.study
      st && study_readable_by_user?(st, user, perms)
    end

    can :update, StudyAnswer do |answer|
      st = answer.study_question&.study
      next false unless st && study_readable_by_user?(st, user, perms)

      study_editable_by_user?(st, user, perms) || answer.user_id == user.id
    end

    can :destroy, StudyAnswer do |answer|
      st = answer.study_question&.study
      next false unless st && study_readable_by_user?(st, user, perms)

      study_editable_by_user?(st, user, perms) || answer.user_id == user.id
    end
  end

  def apply_sermon_abilities_for_user(user)
    perms = user.effective_permissions || {}

    can :read, Sermon do |sermon|
      sermon_readable_by_user?(sermon, user, perms)
    end

    SERMON_NESTED.each do |klass|
      can :read, klass do |obj|
        st = sermon_for_nested(obj)
        st ? sermon_readable_by_user?(st, user, perms) : false
      end
    end

    can :create, Sermon do |subject|
      if subject.is_a?(Class)
        true
      elsif subject.is_a?(Sermon) && !subject.persisted?
        true
      elsif subject.is_a?(Sermon)
        sermon_editable_by_user?(subject, user, perms)
      else
        false
      end
    end

    can :update, Sermon do |sermon|
      sermon_editable_by_user?(sermon, user, perms)
    end

    can :destroy, Sermon do |sermon|
      sermon_editable_by_user?(sermon, user, perms)
    end

    SERMON_NESTED.each do |klass|
      can %i[create update destroy], klass do |obj|
        st = sermon_for_nested(obj)
        st && sermon_editable_by_user?(st, user, perms)
      end
    end
  end

  def apply_document_abilities_for_user(user)
    can %i[read create update destroy], Document, user_id: user.id
  end

  def sermon_for_nested(obj)
    case obj
    when SermonSection
      obj.sermon
    when SermonSectionVerse
      obj.sermon_section&.sermon
    end
  end

  def sermon_readable_by_user?(sermon, user, perms)
    return false unless sermon && user

    return true if sermon.visibility != 'private'
    return true if sermon.user_id == user.id
    return true if perms[:curation]

    false
  end

  def sermon_editable_by_user?(sermon, user, perms)
    return false unless sermon && user

    return true if perms[:curation]
    return true if sermon.user_id == user.id

    false
  end

  def apply_guest_study_abilities
    can :read, Study do |study|
      guest_study_readable?(study)
    end

    STUDY_NESTED.each do |klass|
      can :read, klass do |obj|
        guest_study_readable?(obj.study)
      end
    end

    can :read, StudyAnswer do |answer|
      st = answer.study_question&.study
      st ? guest_study_readable?(st) : false
    end

    can :read, Sermon do |sermon|
      guest_sermon_readable?(sermon)
    end

    SERMON_NESTED.each do |klass|
      can :read, klass do |obj|
        st = sermon_for_nested(obj)
        st ? guest_sermon_readable?(st) : false
      end
    end
  end

  def guest_sermon_readable?(sermon)
    sermon && sermon.visibility != 'private'
  end

  def study_readable_by_user?(study, user, perms)
    return false unless study && user

    return true if study.visibility != 'private'
    return true if study.owner_id == user.id
    return true if perms[:curation]
    return true if StudyAssignment.exists?(study_id: study.id, user_id: user.id)

    false
  end

  def study_editable_by_user?(study, user, perms)
    return false unless study && user

    return true if perms[:curation]
    return true if study.owner_id == user.id
    return true if StudyAssignment.exists?(study_id: study.id, user_id: user.id)

    false
  end

  def guest_study_readable?(study)
    study && study.visibility != 'private'
  end
end
