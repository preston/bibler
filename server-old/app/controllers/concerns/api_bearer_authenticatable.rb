# frozen_string_literal: true

# Sets current_user from Authorization: Bearer <api_token> (opaque token on users.api_token).
module ApiBearerAuthenticatable
  extend ActiveSupport::Concern

  included do
    prepend_before_action :set_current_user_from_bearer_token
  end

  private

  def set_current_user_from_bearer_token
    @current_user = nil
    token = bearer_token_from_header
    return if token.blank?

    @current_user = User.find_by(api_token: token)
  end

  def bearer_token_from_header
    request.authorization.to_s.sub(/\ABearer\s+/i, '').strip
  end

  def require_current_user!
    return if current_user

    render json: { error: 'Authentication required.' }, status: :unauthorized
  end
end
