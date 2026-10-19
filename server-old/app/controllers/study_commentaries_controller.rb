# frozen_string_literal: true

# Author: Preston Lee
class StudyCommentariesController < ApplicationController
  include StudyContext
  include StudyResourceHelpers

  before_action :set_study_commentary, only: %i[show update destroy]

  def index
    @study_commentaries = @study.study_commentaries.ordered
  end

  def show
  end

  def create
    @study_commentary = @study.study_commentaries.new(study_commentary_params)
    @study_commentary.position = next_position_for(@study.study_commentaries) if @study_commentary.position.nil?
    if @study_commentary.save
      render :show, status: :created
    else
      render json: { errors: @study_commentary.errors.full_messages }, status: :unprocessable_entity
    end
  end

  def update
    if @study_commentary.update(study_commentary_params)
      render :show, status: :ok
    else
      render json: { errors: @study_commentary.errors.full_messages }, status: :unprocessable_entity
    end
  end

  def destroy
    @study_commentary.destroy
    head :no_content
  end

  private

  def set_study_commentary
    @study_commentary = find_study_resource!(
      @study.study_commentaries,
      key: params[:uuid],
      error_message: 'Study commentary not found.'
    )
  end

  def study_commentary_params
    params.require(:study_commentary).permit(:source_type, :title, :body, :prompt, :position, context: {})
  end
end
