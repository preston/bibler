# frozen_string_literal: true

# Author: Preston Lee
class StudiesController < ApplicationController
  SORTABLE_COLUMNS = {
    'title' => 'title',
    'visibility' => 'visibility',
    'created_at' => 'created_at',
    'updated_at' => 'updated_at'
  }.freeze
  DEFAULT_PER_PAGE = 25
  MAX_PER_PAGE = 100

  before_action :set_study, only: %i[show update destroy transfer_owner]

  def index
    if params[:scope].to_s == 'owned'
      require_current_user!
      return if performed?
    end

    scoped = index_scope
    q = params[:q].to_s.strip
    scoped = scoped.where('title ILIKE :q OR goal ILIKE :q', q: "%#{q}%") if q.present?

    sort_col = SORTABLE_COLUMNS.fetch(params[:sort].to_s, 'updated_at')
    dir = normalized_direction
    scoped = scoped.order(sort_col => dir)

    page = normalized_page
    per_page = clamped_per_page
    total_count = scoped.count
    total_pages = (total_count.to_f / per_page).ceil
    offset = (page - 1) * per_page

    @studies = scoped.includes(:owner).offset(offset).limit(per_page)
    @studies.each { |study| authorize! :read, study }
    @study_total_duration_by_id = study_total_duration_by_id(@studies)
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
    authorize! :read, @study
    @viewer = current_user
  end

  def create
    require_current_user!
    return if performed?

    authorize! :create, Study
    @study = Study.new(study_params)
    @study.owner = current_user
    @viewer = current_user
    if @study.save
      render :show, status: :created
    else
      render json: { errors: @study.errors.full_messages }, status: :unprocessable_entity
    end
  end

  def update
    authorize! :update, @study
    @viewer = current_user
    if @study.update(study_params)
      render :show, status: :ok
    else
      render json: { errors: @study.errors.full_messages }, status: :unprocessable_entity
    end
  end

  def destroy
    authorize! :destroy_study, @study
    @study.destroy
    head :no_content
  end

  def transfer_owner
    authorize! :transfer_ownership, @study
    target_id = params[:user_id].presence || params.dig(:transfer, :user_id)
    target = User.find_by(id: target_id)
    unless target
      render json: { error: 'User not found.' }, status: :unprocessable_entity
      return
    end

    unless @study.study_assignments.exists?(user_id: target.id)
      render json: { error: 'Target must be an existing co-leader.' }, status: :unprocessable_entity
      return
    end

    old_owner_id = @study.owner_id
    if old_owner_id == target.id
      render json: { error: 'That user is already the owner.' }, status: :unprocessable_entity
      return
    end

    Study.transaction do
      @study.study_assignments.where(user_id: target.id).destroy_all
      @study.update!(owner: target)
      StudyAssignment.find_or_create_by!(study_id: @study.id, user_id: old_owner_id)
    end

    @viewer = current_user
    render :show, status: :ok
  end

  private

  def index_scope
    case params[:scope].to_s
    when 'owned'
      Study
        .left_outer_joins(:study_assignments)
        .where('studies.owner_id = :uid OR study_assignments.user_id = :uid', uid: current_user.id)
        .distinct
    else
      Study.where(visibility: 'public')
    end
  end

  def set_study
    @study = Study.includes(:owner).find_by(id: params[:uuid])
    return if @study

    render json: { error: 'Study not found.' }, status: :not_found
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

  def study_params
    params.require(:study).permit(:title, :goal, :visibility)
  end

  def study_total_duration_by_id(studies)
    ids = studies.map(&:id)
    return {} if ids.empty?

    StudyPlanItem
      .where(study_id: ids)
      .where('duration > 0')
      .group(:study_id)
      .sum(:duration)
  end
end
