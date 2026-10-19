# frozen_string_literal: true

# Author: Preston Lee
class SermonSectionsController < ApplicationController
  include SermonSectionContext

  def index
    @sermon_sections = @sermon.sermon_sections.includes(sermon_section_verses: :verse).order(:position, :id)
  end

  def create
    @sermon_section = @sermon.sermon_sections.new(sermon_section_params)
    @sermon_section.position = next_position if @sermon_section.position.nil?
    if @sermon_section.save
      render :show, status: :created
    else
      render json: { errors: @sermon_section.errors.full_messages }, status: :unprocessable_entity
    end
  end

  def update
    if @sermon_section.update(sermon_section_params)
      render :show, status: :ok
    else
      render json: { errors: @sermon_section.errors.full_messages }, status: :unprocessable_entity
    end
  end

  def destroy
    @sermon_section.destroy
    head :no_content
  end

  private

  def next_position
    (@sermon.sermon_sections.maximum(:position) || -1) + 1
  end

  def sermon_section_params
    params.require(:sermon_section).permit(:title, :body, :position, :estimated_minutes)
  end
end
