# frozen_string_literal: true

module System
  class RolesController < ApplicationController
    before_action :set_role, only: %i[show update destroy]

    def index
      authorize! :read, Role
      render json: { roles: Role.order(:name).map { |r| role_json(r) } }
    end

    def show
      authorize! :read, @role
      render json: { role: role_json(@role) }
    end

    def create
      authorize! :create, Role
      role = Role.new(role_params)
      if role.save
        render json: { role: role_json(role) }, status: :created
      else
        render json: { errors: role.errors.full_messages }, status: :unprocessable_entity
      end
    end

    def update
      authorize! :update, @role
      if @role.update(role_params)
        render json: { role: role_json(@role) }
      else
        render json: { errors: @role.errors.full_messages }, status: :unprocessable_entity
      end
    end

    def destroy
      authorize! :destroy, @role
      @role.destroy
      head :no_content
    end

    private

    def set_role
      @role = Role.find(params[:id])
    end

    def role_params
      params.require(:role).permit(:name, :is_default, :administrator, :bibles, :access, :curation)
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
end
