# frozen_string_literal: true

class StudyPlanItemsController < ApplicationController
  include StudyContext
  include StudyResourceHelpers

  before_action :set_item, only: %i[update destroy update_state]

  def index
    states = {}
    if current_user
      StudyPlanItemUserState.where(user_id: current_user.id, study_plan_item_id: @study.study_plan_item_ids).find_each do |s|
        states[s.study_plan_item_id] = s.status
      end
    end
    plan_items = @study.study_plan_items.ordered.map do |i|
      my = current_user ? (states[i.id] || 'todo') : nil
      serialize_item(i, my_status: my)
    end
    render json: { plan_items: plan_items }
  end

  def create
    item = @study.study_plan_items.new(item_params)
    item.position = next_position_for(@study.study_plan_items) if item.position.nil?
    if item.save
      my = current_user ? 'todo' : nil
      render json: { plan_item: serialize_item(item, my_status: my) }, status: :created
    else
      render json: { errors: item.errors.full_messages }, status: :unprocessable_entity
    end
  end

  def update
    if @item.update(item_params)
      my = nil
      if current_user
        my = StudyPlanItemUserState.find_by(user_id: current_user.id, study_plan_item_id: @item.id)&.status || 'todo'
      end
      render json: { plan_item: serialize_item(@item, my_status: my) }
    else
      render json: { errors: @item.errors.full_messages }, status: :unprocessable_entity
    end
  end

  def destroy
    @item.destroy
    head :no_content
  end

  def update_state
    require_current_user!
    return if performed?

    status = params[:status].to_s
    if status.blank?
      return render json: { error: 'status is required.' }, status: :unprocessable_entity
    end
    unless StudyPlanItemUserState::STATUSES.include?(status)
      return render json: { error: 'Invalid status.' }, status: :unprocessable_entity
    end

    rec = StudyPlanItemUserState.find_or_initialize_by(user: current_user, study_plan_item: @item)
    rec.status = status
    if rec.save
      render json: { plan_item: serialize_item(@item.reload, my_status: rec.status) }
    else
      render json: { errors: rec.errors.full_messages }, status: :unprocessable_entity
    end
  end

  def reorder
    ordered = Array(params[:ordered_uuids]).map(&:to_s)
    items = @study.study_plan_items.index_by(&:uuid)
    return render json: { error: 'No plan item UUIDs supplied.' }, status: :unprocessable_entity if ordered.empty?

    StudyPlanItem.transaction do
      ordered.each_with_index do |uuid, idx|
        item = items[uuid]
        next unless item

        item.update!(position: idx)
      end
    end

    states = {}
    if current_user
      StudyPlanItemUserState.where(user_id: current_user.id, study_plan_item_id: @study.study_plan_item_ids).find_each do |s|
        states[s.study_plan_item_id] = s.status
      end
    end
    plan_items = @study.study_plan_items.ordered.map do |i|
      my = current_user ? (states[i.id] || 'todo') : nil
      serialize_item(i, my_status: my)
    end
    render json: { plan_items: plan_items }
  end

  private

  def set_item
    @item = find_study_resource!(
      @study.study_plan_items,
      key: params[:uuid],
      error_message: 'Study plan item not found.'
    )
  end

  def item_params
    params.require(:study_plan_item).permit(
      :title,
      :item_type,
      :notes,
      :position,
      :duration,
      :anchor,
      :resource_type,
      :resource_uuid
    )
  end

  def serialize_item(item, my_status: nil)
    h = item.slice(
      :uuid,
      :title,
      :item_type,
      :notes,
      :position,
      :duration,
      :anchor,
      :resource_type,
      :resource_uuid,
      :created_at,
      :updated_at
    )
    h[:duration] = nil if item.effective_duration.nil?
    h[:my_status] = my_status unless my_status.nil?
    h
  end
end
