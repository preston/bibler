# frozen_string_literal: true

# Author: Preston Lee
class DocumentsController < ApplicationController
  before_action :require_current_user!
  before_action :set_document, only: %i[update destroy]

  def index
    scoped = Document.where(user_id: current_user.id).order(updated_at: :desc)
    q = params[:q].to_s.strip
    scoped = scoped.where('original_filename ILIKE :q OR extracted_text ILIKE :q', q: "%#{q}%") if q.present?
    @documents = scoped.limit(500)
    @viewer = current_user
  end

  def create
    @document = current_user.documents.new(document_params)
    authorize! :create, @document
    if @document.save
      render :show, status: :created
    else
      render json: { errors: @document.errors.full_messages }, status: :unprocessable_entity
    end
  end

  def update
    authorize! :update, @document
    if @document.update(document_params)
      render :show, status: :ok
    else
      render json: { errors: @document.errors.full_messages }, status: :unprocessable_entity
    end
  end

  def destroy
    authorize! :destroy, @document
    @document.destroy
    head :no_content
  end

  private

  def set_document
    @document = Document.find_by(id: params[:uuid])
    return if @document

    render json: { error: 'Document not found.' }, status: :not_found
  end

  def document_params
    params.require(:document).permit(:original_filename, :extracted_text)
  end
end
