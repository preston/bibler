# frozen_string_literal: true

# Author: Preston Lee
class StudyAssignmentsController < ApplicationController
  include StudyContext

  def index
    authorize! :manage_study_access, @study
    rows = @study.study_assignments.includes(:user).map { |a| assignment_json(a) }
    render json: { assignments: rows }
  end

  def create
    authorize! :manage_study_access, @study
    login = params[:username].to_s.strip.presence || params[:email].to_s.strip.presence
    if login.blank?
      render json: { error: 'username or email is required.' }, status: :unprocessable_entity
      return
    end

    user = User.where('lower(username) = ?', login.downcase).first
    user ||= User.where('lower(email) = ?', login.downcase).first
    unless user
      render json: { error: 'No user matches that username or email.' }, status: :unprocessable_entity
      return
    end

    if user.id == @study.owner_id
      render json: { error: 'The study owner is already a leader; add a different user.' }, status: :unprocessable_entity
      return
    end

    assignment = @study.study_assignments.build(user: user)
    if assignment.save
      render json: { assignment: assignment_json(assignment.reload) }, status: :created
    else
      render json: { errors: assignment.errors.full_messages }, status: :unprocessable_entity
    end
  end

  def destroy
    authorize! :manage_study_access, @study
    uid = params[:user_id]
    assignment = @study.study_assignments.find_by(user_id: uid)
    unless assignment
      render json: { error: 'Assignment not found.' }, status: :not_found
      return
    end

    assignment.destroy!
    head :no_content
  end

  private

  def assignment_json(assignment)
    u = assignment.user
    {
      user_id: u.id,
      username: u.username,
      name: u.name,
      email: u.email
    }
  end
end