# frozen_string_literal: true

# Author: Preston Lee
class ApplicationController < ActionController::Base
  include ApiBearerAuthenticatable
  include CanCan::ControllerAdditions
  skip_before_action :verify_authenticity_token
  rescue_from CanCan::AccessDenied, with: :render_forbidden

  def current_user
    @current_user
  end

  def current_access_principal
    current_user
  end

  def current_ability
    @current_ability ||= Ability.new(current_access_principal)
  end

  private

  def render_forbidden(exception)
    render json: { error: "Access denied: #{exception.action} #{exception.subject.class}" }, status: :forbidden
  end
end
