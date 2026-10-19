# frozen_string_literal: true

module Sermons
  class AiController < ApplicationController
    include SermonContext

    def verse_pass
      req_target = params[:target_duration_minutes]
      req_target = req_target.present? ? req_target.to_i : nil
      result = Ollama::SermonAssistantOrchestrator.new(
        sermon: @sermon,
        user_message: params[:message].to_s,
        document_uuids: Array(params[:document_uuids]),
        replace_sections: params[:replace_sections].nil? || ActiveModel::Type::Boolean.new.cast(params[:replace_sections]),
        verse_target_duration_minutes: (req_target&.positive? ? req_target : nil)
      ).verse_pass

      status = result[:error].present? ? :unprocessable_entity : :ok
      render json: result, status: status
    end

    def outline_pass
      req_target = params[:target_duration_minutes]
      req_target = req_target.present? ? req_target.to_i : nil
      result = Ollama::SermonAssistantOrchestrator.new(
        sermon: @sermon,
        user_message: params[:message].to_s,
        document_uuids: Array(params[:document_uuids]),
        outline_target_duration_minutes: (req_target&.positive? ? req_target : nil)
      ).outline_pass

      status = result[:error].present? ? :unprocessable_entity : :ok
      render json: result, status: status
    end
  end
end
