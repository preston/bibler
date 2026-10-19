# frozen_string_literal: true

# Author: Preston Lee
class SermonsController < ApplicationController
  SORTABLE_COLUMNS = {
    'title' => 'title',
    'visibility' => 'visibility',
    'created_at' => 'created_at',
    'updated_at' => 'updated_at'
  }.freeze
  DEFAULT_PER_PAGE = 25
  MAX_PER_PAGE = 100

  before_action :set_sermon, only: %i[show update destroy]

  def index
    if params[:scope].to_s == 'owned'
      require_current_user!
      return if performed?
    end

    scoped = index_scope
    q = params[:q].to_s.strip
    scoped = scoped.where('title ILIKE :q', q: "%#{q}%") if q.present?

    sort_col = SORTABLE_COLUMNS.fetch(params[:sort].to_s, 'updated_at')
    dir = normalized_direction
    scoped = scoped.order(sort_col => dir)

    page = normalized_page
    per_page = clamped_per_page
    total_count = scoped.count
    total_pages = (total_count.to_f / per_page).ceil
    offset = (page - 1) * per_page

    @sermons = scoped.includes(:owner).offset(offset).limit(per_page)
    @sermons.each { |sermon| authorize! :read, sermon }
    @meta = {
      page: page,
      per_page: per_page,
      total_count: total_count,
      total_pages: total_pages,
      sort: sort_col,
      direction: dir,
      q: q
    }
    @viewer = current_user
  end

  def show
    authorize! :read, @sermon
    @viewer = current_user
  end

  def create
    require_current_user!
    return if performed?

    authorize! :create, Sermon
    @sermon = Sermon.new(sermon_params)
    @sermon.owner = current_user
    @viewer = current_user
    if @sermon.save
      render :show, status: :created
    else
      render json: { errors: @sermon.errors.full_messages }, status: :unprocessable_entity
    end
  end

  def update
    authorize! :update, @sermon
    @viewer = current_user
    if @sermon.update(sermon_params)
      render :show, status: :ok
    else
      render json: { errors: @sermon.errors.full_messages }, status: :unprocessable_entity
    end
  end

  def destroy
    authorize! :destroy, @sermon
    @sermon.destroy
    head :no_content
  end

  private

  def index_scope
    case params[:scope].to_s
    when 'owned'
      Sermon.where(user_id: current_user.id)
    else
      Sermon.where(visibility: 'public')
    end
  end

  def set_sermon
    @sermon = Sermon.includes(:owner).find_by(id: params[:uuid])
    return if @sermon

    render json: { error: 'Sermon not found.' }, status: :not_found
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

  def sermon_params
    params.require(:sermon).permit(:title, :visibility, :target_duration_minutes)
  end
end
