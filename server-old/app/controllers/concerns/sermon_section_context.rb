# frozen_string_literal: true

# Author: Preston Lee
module SermonSectionContext
  extend ActiveSupport::Concern

  include SermonContext

  included do
    before_action :set_sermon_section, only: %i[update destroy]
  end

  private

  def set_sermon_section
    @sermon_section = @sermon.sermon_sections.find_by(id: params[:uuid])
    return if @sermon_section

    render json: { error: 'Sermon section not found.' }, status: :not_found
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
