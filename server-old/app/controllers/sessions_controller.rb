# frozen_string_literal: true

class SessionsController < ApplicationController
  def create
    username = params[:username].to_s.strip
    password = params[:password].to_s
    user = User.find_for_database_authentication(username: username)
    if user&.valid_password?(password)
      user.regenerate_api_token
      render json: SessionSerializer.new(user).as_json, status: :created
    else
      render json: { error: 'Invalid username or password.' }, status: :unauthorized
    end
  end

  def show
    require_current_user!
    return if performed?

    render json: SessionSerializer.new(current_user).as_json
  end

  def destroy
    require_current_user!
    return if performed?

    current_user.regenerate_api_token
    head :no_content
  end
end
