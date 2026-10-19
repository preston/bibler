# frozen_string_literal: true

class SessionSerializer
  def initialize(user)
    @user = user
  end

  def as_json
    {
      token: @user.api_token,
      user: user_json,
      roles: @user.roles.map { |r| role_json(r) },
      permissions: @user.effective_permissions
    }
  end

  private

  def user_json
    {
      id: @user.id,
      username: @user.username,
      email: @user.email,
      name: @user.name
    }
  end

  def role_json(role)
    {
      id: role.id,
      name: role.name,
      default: role.is_default,
      administrator: role.administrator,
      bibles: role.bibles,
      access: role.access,
      curation: role.curation
    }
  end
end
