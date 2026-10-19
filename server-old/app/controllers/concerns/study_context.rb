# frozen_string_literal: true

# Author: Preston Lee
module StudyContext
  extend ActiveSupport::Concern

  included do
    before_action :set_study
    before_action :authorize_study_access
  end

  private

  def set_study
    @study = Study.find_by(id: params[:study_uuid])
    return if @study

    render json: { error: 'Study not found.' }, status: :not_found
  end

  def authorize_study_access
    authorize!(action_to_permission, @study)
  end

  def action_to_permission
    case action_name
    when 'update_state'
      :read
    when 'index', 'show', 'assistant', 'generate_commentary', 'summarize', 'generate_questions'
      :read
    when 'create'
      :create
    when 'update', 'reorder'
      :update
    when 'destroy'
      :destroy
    else
      :manage
    end
  end
end
