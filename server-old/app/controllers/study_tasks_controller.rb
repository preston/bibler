# frozen_string_literal: true

# Author: Preston Lee
class StudyTasksController < ApplicationController
  include StudyContext
  include StudyResourceHelpers

  before_action :set_study_task, only: %i[show update destroy]

  def index
    @study_tasks = @study.study_tasks.ordered
  end

  def show
  end

  def create
    @study_task = @study.study_tasks.new(study_task_params)
    @study_task.position = next_position_for(@study.study_tasks) if @study_task.position.nil?
    if @study_task.save
      render :show, status: :created
    else
      render json: { errors: @study_task.errors.full_messages }, status: :unprocessable_entity
    end
  end

  def update
    if @study_task.update(study_task_params)
      render :show, status: :ok
    else
      render json: { errors: @study_task.errors.full_messages }, status: :unprocessable_entity
    end
  end

  def destroy
    @study_task.destroy
    head :no_content
  end

  def reorder
    ids = Array(params[:ordered_uuids])
    ids.each_with_index do |uuid, position|
      task = @study.study_tasks.find_by(id: uuid)
      task&.update(position:)
    end
    @study_tasks = @study.study_tasks.ordered
    render :index, status: :ok
  end

  private

  def set_study_task
    @study_task = find_study_resource!(
      @study.study_tasks,
      key: params[:uuid],
      error_message: 'Study task not found.'
    )
  end

  def study_task_params
    params.require(:study_task).permit(:instruction, :task_type, :status, :assignee_label, :due_at, :position, context: {})
  end
end
