# frozen_string_literal: true

module System
  class UsersController < ApplicationController
    SORTABLE_COLUMNS = {
      'username' => 'username',
      'email' => 'email',
      'name' => 'name',
      'created_at' => 'created_at',
      'updated_at' => 'updated_at'
    }.freeze
    DEFAULT_PER_PAGE = 25
    MAX_PER_PAGE = 100

    before_action :set_user, only: %i[show update]

    def index
      authorize! :read, User
      scoped = User.all
      q = params[:q].to_s.strip
      if q.present?
        scoped = scoped.where(
          'username ILIKE :q OR email ILIKE :q OR name ILIKE :q',
          q: "%#{q}%"
        )
      end

      sort_col = SORTABLE_COLUMNS.fetch(params[:sort].to_s, 'username')
      dir = normalized_direction
      scoped = scoped.order(sort_col => dir)

      page = normalized_page
      per_page = clamped_per_page
      total_count = scoped.count
      total_pages = (total_count.to_f / per_page).ceil
      offset = (page - 1) * per_page

      rows = scoped.offset(offset).limit(per_page)
      render json: {
        users: rows.map { |u| user_summary_json(u) },
        meta: {
          page: page,
          per_page: per_page,
          total_count: total_count,
          total_pages: total_pages,
          sort: sort_col,
          direction: dir,
          q: q
        }
      }
    end

    def show
      authorize! :read, @user
      render json: { user: user_detail_json(@user) }
    end

    def create
      authorize! :create, User
      user = User.new(user_create_params)
      unless user.save
        render json: { errors: user.errors.full_messages }, status: :unprocessable_entity
        return
      end

      assign_roles(user, params[:role_ids]) if params.key?(:role_ids)
      user.apply_default_roles!
      user.save!
      render json: { user: user_detail_json(user.reload) }, status: :created
    end

    def update
      authorize! :update, @user
      if params[:user].present?
        permitted = user_update_params
        @user.assign_attributes(permitted) if permitted.any?
      end
      assign_roles(@user, params[:role_ids]) if params.key?(:role_ids)
      if @user.save
        render json: { user: user_detail_json(@user) }
      else
        render json: { errors: @user.errors.full_messages }, status: :unprocessable_entity
      end
    end

    private

    def set_user
      @user = User.find(params[:id])
    end

    def user_create_params
      params.require(:user).permit(:username, :email, :name, :password, :password_confirmation)
    end

    def user_update_params
      base = params.require(:user).permit(:email, :name, :password, :password_confirmation)
      base.delete(:password) if base[:password].blank?
      base.delete(:password_confirmation) if base[:password_confirmation].blank?
      base
    end

    def assign_roles(user, role_ids)
      return unless role_ids

      ids = Array(role_ids).map(&:to_i).reject(&:zero?)
      user.role_ids = ids
    end

    def normalized_direction
      params[:direction].to_s.casecmp('asc').zero? ? :asc : :desc
    end

    def clamped_per_page
      raw = params[:per_page].to_i
      raw = DEFAULT_PER_PAGE if raw <= 0
      [raw, MAX_PER_PAGE].min
    end

    def normalized_page
      raw = params[:page].to_i
      raw < 1 ? 1 : raw
    end

    def user_summary_json(user)
      {
        id: user.id,
        username: user.username,
        email: user.email,
        name: user.name,
        created_at: user.created_at,
        updated_at: user.updated_at
      }
    end

    def user_detail_json(user)
      user_summary_json(user).merge(
        roles: user.roles.map do |r|
          {
            id: r.id,
            name: r.name,
            default: r.is_default,
            administrator: r.administrator,
            bibles: r.bibles,
            access: r.access,
            curation: r.curation
          }
        end
      )
    end
  end
end
