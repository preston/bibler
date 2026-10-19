# frozen_string_literal: true

# Author: Preston Lee
class SermonSectionVersesController < ApplicationController
  include SermonSectionVerseContext

  def index
    @sermon_section_verses = @sermon_section.sermon_section_verses.ordered.includes(:verse)
  end

  def create
    @sermon_section_verse = @sermon_section.sermon_section_verses.new(sermon_section_verse_params)
    @sermon_section_verse.position = next_position if @sermon_section_verse.position.nil?
    if @sermon_section_verse.save
      render :show, status: :created
    else
      render json: { errors: @sermon_section_verse.errors.full_messages }, status: :unprocessable_entity
    end
  end

  def update
    if @sermon_section_verse.update(sermon_section_verse_params)
      render :show, status: :ok
    else
      render json: { errors: @sermon_section_verse.errors.full_messages }, status: :unprocessable_entity
    end
  end

  def destroy
    @sermon_section_verse.destroy
    head :no_content
  end

  private

  def next_position
    (@sermon_section.sermon_section_verses.maximum(:position) || -1) + 1
  end

  def sermon_section_verse_params
    params.require(:sermon_section_verse).permit(:verse_uuid, :bible_uuid, :book_uuid, :chapter, :ordinal, :verse_text, :position)
  end
end
