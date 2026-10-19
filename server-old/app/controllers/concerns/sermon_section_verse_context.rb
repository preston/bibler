# frozen_string_literal: true

# Author: Preston Lee
module SermonSectionVerseContext
  extend ActiveSupport::Concern

  include SermonContext

  included do
    before_action :set_sermon_section
    before_action :set_sermon_section_verse, only: %i[update destroy]
  end

  private

  def set_sermon_section
    @sermon_section = @sermon.sermon_sections.find_by(id: params[:section_uuid])
    return if @sermon_section

    render json: { error: 'Sermon section not found.' }, status: :not_found
  end

  def set_sermon_section_verse
    @sermon_section_verse = @sermon_section.sermon_section_verses.find_by(id: params[:verse_uuid])
    return if @sermon_section_verse

    render json: { error: 'Sermon section verse not found.' }, status: :not_found
  end

  def action_to_sermon_permission
    case action_name
    when 'index'
      :read
    when 'create', 'update', 'destroy'
      :update
    else
      super
    end
  end
end
