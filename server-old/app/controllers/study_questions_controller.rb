# frozen_string_literal: true

# Author: Preston Lee
class StudyQuestionsController < ApplicationController
  include StudyContext
  include StudyResourceHelpers

  before_action :set_study_question, only: %i[show update destroy]

  def index
    @study_questions = @study.study_questions.ordered
  end

  def show
  end

  def create
    @study_question = @study.study_questions.new(study_question_params)
    @study_question.position = next_position_for(@study.study_questions) if @study_question.position.nil?
    if @study_question.save
      render :show, status: :created
    else
      render json: { errors: @study_question.errors.full_messages }, status: :unprocessable_entity
    end
  end

  def update
    if @study_question.update(study_question_params)
      render :show, status: :ok
    else
      render json: { errors: @study_question.errors.full_messages }, status: :unprocessable_entity
    end
  end

  def destroy
    @study_question.destroy
    head :no_content
  end

  def reorder
    ids = Array(params[:ordered_uuids])
    ids.each_with_index do |uuid, position|
      question = @study.study_questions.find_by(id: uuid)
      question&.update(position:)
    end
    @study_questions = @study.study_questions.ordered
    render :index, status: :ok
  end

  private

  def set_study_question
    @study_question = find_study_resource!(
      @study.study_questions,
      key: params[:uuid],
      error_message: 'Study question not found.'
    )
  end

  def study_question_params
    params.require(:study_question).permit(:prompt, :question_type, :guidance_notes, :position, verse_anchor: {})
  end
end
