# frozen_string_literal: true

# Author: Preston Lee
class StudyRolesController < ApplicationController
  include StudyContext

  def show; end

  def update
    render :show, status: :ok
  end
end
