# frozen_string_literal: true

# Author: Preston Lee
class StudyVersesController < ApplicationController
  include StudyContext

  before_action :set_study_verse, only: %i[update destroy]

  def index
    @study_verses = @study.study_verses.ordered.includes(:verse)
  end

  def create
    @study_verse = @study.study_verses.new(study_verse_params)
    @study_verse.position = next_position if @study_verse.position.nil?
    if @study_verse.save
      render :show, status: :created
    else
      render json: { errors: @study_verse.errors.full_messages }, status: :unprocessable_entity
    end
  end

  def destroy
    @study_verse.destroy
    head :no_content
  end

  def update
    if @study_verse.update(study_verse_params)
      render :show, status: :ok
    else
      render json: { errors: @study_verse.errors.full_messages }, status: :unprocessable_entity
    end
  end

  private

  def set_study_verse
    @study_verse = @study.study_verses.find_by(id: params[:uuid])
    return if @study_verse

    render json: { error: 'Study verse not found.' }, status: :not_found
  end

  def next_position
    (@study.study_verses.maximum(:position) || -1) + 1
  end

  def study_verse_params
    params.require(:study_verse).permit(:verse_uuid, :bible_uuid, :book_uuid, :chapter, :ordinal, :verse_text, :note, :position)
  end
end
