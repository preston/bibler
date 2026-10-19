# frozen_string_literal: true

# Author: Preston Lee
module Studies
  class AiController < ApplicationController
    include ActionController::Live
    include StudyContext

    # Wall-clock cap for the whole assistant run (two LLM rounds + search). Default matches a generous
    # multi-minute local Ollama job; override with BIBLER_ASSISTANT_SSE_MAX_SECONDS (e.g. 900).
    def self.max_assistant_stream_seconds
      Integer(ENV.fetch('BIBLER_ASSISTANT_SSE_MAX_SECONDS', '600'))
    rescue ArgumentError, TypeError
      600
    end

    def generate_commentary
      prompt_context = {
        study: @study.slice(:uuid, :title, :goal),
        verses: @study.study_verses.ordered.includes(:verse).limit(30).map { |sv| study_verse_ai_slice(sv) },
        user_instruction: params[:instruction].to_s
      }

      result = Ollama::ChatService.new.generate(
        prompt: params[:prompt].to_s,
        context: prompt_context,
        model: nil,
        system_message: Ollama::Prompts::StudyCommentary.generate_system_prompt
      )
      render json: result, status: result[:error].present? ? :unprocessable_entity : :ok
    end

    def summarize
      prompt_context = {
        study: @study.slice(:uuid, :title, :goal),
        commentaries: @study.study_commentaries.ordered.limit(20).map { |c| c.slice(:title, :body, :source_type) },
        questions: @study.study_questions.ordered.limit(20).map { |q| q.slice(:prompt, :question_type) }
      }

      result = Ollama::ChatService.new.generate(
        prompt: params[:prompt].presence || 'Provide a concise biblical summary of this study session.',
        context: prompt_context,
        model: nil
      )
      render json: result, status: result[:error].present? ? :unprocessable_entity : :ok
    end

    def generate_questions
      prompt_context = {
        study: @study.slice(:uuid, :title, :goal),
        verses: @study.study_verses.ordered.includes(:verse).limit(40).map { |sv| study_verse_ai_slice(sv).except(:note) }
      }
      result = Ollama::ChatService.new.generate(
        prompt: params[:prompt].presence || 'Generate discussion questions anchored in scripture references from the provided study verses.',
        context: prompt_context,
        model: nil
      )
      render json: result, status: result[:error].present? ? :unprocessable_entity : :ok
    end

    def assistant
      if assistant_stream_requested?
        assistant_as_sse
      else
        result = Ollama::StudyAssistantOrchestrator.new(
          study: @study,
          user_message: params[:message].to_s,
          model: nil,
          stream: false,
          target_duration_minutes: assistant_target_duration_minutes
        ).call

        status = Ollama::ChatService.response_error?(result) ? :unprocessable_entity : :ok
        render json: result, status: status
      end
    end

    private

    def assistant_target_duration_minutes
      v = params[:target_duration_minutes]
      return nil if v.blank?

      n = Integer(v, exception: false)
      n = v.to_i if n.nil?
      n.positive? ? n : nil
    end

    def study_verse_ai_slice(sv)
      {
        bible_uuid: sv.bible_uuid,
        book_uuid: sv.book_uuid,
        chapter: sv.chapter,
        ordinal: sv.ordinal,
        verse_uuid: sv.verse_uuid,
        verse_text: (sv.verse&.text).presence || sv.verse_text,
        note: sv.note
      }
    end

    def assistant_stream_requested?
      return true if params[:stream].to_s.in?(%w[1 true yes])
      return true if request.get_header('HTTP_ACCEPT').to_s.include?('text/event-stream')

      false
    end

    def assistant_as_sse
      response.headers['Content-Type'] = 'text/event-stream'
      response.headers['Cache-Control'] = 'no-cache'
      response.headers['Connection'] = 'keep-alive'
      response.headers['X-Accel-Buffering'] = 'no'

      stream_started_at = Process.clock_gettime(Process::CLOCK_MONOTONIC)
      stream_closed = false
      writer = lambda do |h|
        if !stream_closed && (Process.clock_gettime(Process::CLOCK_MONOTONIC) - stream_started_at) >= self.class.max_assistant_stream_seconds
          stream_closed = true
          response.stream.write(
            "event: error\ndata: #{ { error: 'Assistant stream timed out.', hint: 'Set BIBLER_ASSISTANT_SSE_MAX_SECONDS (seconds) on the server if runs need longer.' }.to_json }\n\n"
          )
          raise ActionController::Live::ClientDisconnected
        end
        name = h[:event].presence || 'message'
        response.stream.write("event: #{name}\ndata: #{h[:data].to_json}\n\n")
      end

      begin
        Rails.logger.info("[StudyAssistant SSE] stream_started study_uuid=#{@study.uuid}")
        Ollama::StudyAssistantOrchestrator.new(
          study: @study,
          user_message: params[:message].to_s,
          model: nil,
          stream: true,
          on_event: writer,
          target_duration_minutes: assistant_target_duration_minutes
        ).call
      rescue ActionController::Live::ClientDisconnected
        nil
      rescue StandardError => e
        Rails.logger.error("[StudyAssistant SSE] #{e.class}: #{e.message}\n#{e.backtrace&.first(5)&.join("\n")}")
        writer.call({ event: 'error', data: { error: e.message } })
      ensure
        elapsed_ms = ((Process.clock_gettime(Process::CLOCK_MONOTONIC) - stream_started_at) * 1000).round
        Rails.logger.info("[StudyAssistant SSE] stream_closed study_uuid=#{@study.uuid} elapsed_ms=#{elapsed_ms}")
        response.stream.close
      end
    end
  end
end
