# frozen_string_literal: true

# Author: Preston Lee
module SermonContext
  extend ActiveSupport::Concern

  included do
    before_action :set_sermon
    before_action :authorize_sermon_access
  end

  private

  def set_sermon
    @sermon = Sermon.includes(:owner).find_by(id: params[:sermon_uuid])
    return if @sermon

    render json: { error: 'Sermon not found.' }, status: :not_found
  end

  def authorize_sermon_access
    authorize!(action_to_sermon_permission, @sermon)
  end

  def action_to_sermon_permission
    case action_name
    when 'index', 'show'
      :read
    when 'verse_pass', 'outline_pass'
      :update
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
