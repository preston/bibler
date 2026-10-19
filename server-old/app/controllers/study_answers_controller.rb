# frozen_string_literal: true

# Author: Preston Lee
class StudyAnswersController < ApplicationController
  include StudyContext

  skip_before_action :authorize_study_access
  before_action :set_study_question
  before_action :set_study_answer, only: %i[update destroy]
  before_action :authorize_answer_access
  before_action :require_current_user!, only: %i[create]

  def index
    @study_answers = @study_question.study_answers.order(created_at: :asc)
  end

  def create
    @study_answer = @study_question.study_answers.new(study_answer_params)
    @study_answer.study = @study
    @study_answer.user = current_user
    if @study_answer.save
      render :show, status: :created
    else
      render json: { errors: @study_answer.errors.full_messages }, status: :unprocessable_entity
    end
  end

  def update
    if @study_answer.update(study_answer_params)
      render :show, status: :ok
    else
      render json: { errors: @study_answer.errors.full_messages }, status: :unprocessable_entity
    end
  end

  def destroy
    @study_answer.destroy
    head :no_content
  end

  private

  def authorize_answer_access
    case action_name
    when 'index'
      authorize! :read, @study
    when 'create'
      answer = @study_question.study_answers.new(study_answer_params)
      answer.study = @study
      answer.user = current_user
      authorize! :create, answer
    when 'update'
      authorize! :update, @study_answer
    when 'destroy'
      authorize! :destroy, @study_answer
    else
      authorize! :read, @study
    end
  end

  def set_study_question
    @study_question = @study.study_questions.find_by(id: params[:study_question_uuid])
    return if @study_question

    render json: { error: 'Study question not found.' }, status: :not_found
  end

  def set_study_answer
    @study_answer = @study_question.study_answers.find_by(id: params[:uuid])
    return if @study_answer

    render json: { error: 'Study answer not found.' }, status: :not_found
  end

  def study_answer_params
    params.require(:study_answer).permit(:response, :author_label, :visibility, :study_commentary_id)
  end
end
