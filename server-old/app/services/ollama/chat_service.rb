# frozen_string_literal: true

module Ollama
  class ChatService
    def initialize(client: Ollama::Client.new)
      @client = client
    end

    # Ollama JSON uses string keys; our synthetic errors may use symbols.
    def self.response_error?(response)
      response.is_a?(Hash) && (response[:error].present? || response['error'].present?)
    end

    def generate(prompt:, context:, model: nil, system_message: nil)
      final_prompt = PromptPolicy.compose(prompt: prompt, context: context)
      system = system_message.presence || PromptPolicy.system_message
      response = @client.chat(
        model: model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: final_prompt }
        ]
      )

      return response if self.class.response_error?(response)

      {
        model: response['model'],
        output: response.dig('message', 'content'),
        raw: response
      }
    end

    # Raw user message (no PromptPolicy.compose wrapper). Used by study assistant orchestration and comparator.
    # When +parse_json_output+ is true, +message.content+ is parsed as JSON; +output+ and +raw['message']['content']+
    # are the resulting Hash/Array and +structured_output+ is true. If the model returns prose (refusals, etc.),
    # +output+ stays the string, +raw+ is unchanged, and +structured_output+ is false (still HTTP 200).
    def chat_with_system(system_message:, user_content:, model: nil, parse_json_output: false, ollama_format: nil,
                         ollama_options: nil)
      messages = [
        { role: 'system', content: system_message },
        { role: 'user', content: user_content }
      ]
      response = @client.chat(
        model: model,
        messages: messages,
        format: ollama_format,
        options: Ollama::InferenceOptions.merge(ollama_options)
      )

      return response if self.class.response_error?(response)

      result = {
        model: response['model'],
        output: response.dig('message', 'content'),
        raw: response
      }
      return result unless parse_json_output

      parse_json_chat_result(response)
    end

    # Streaming chat; yields accumulated text via on_delta for each Ollama chunk.
    # Optional +format+ (e.g. "json") is passed to Ollama for structured output.
    def chat_with_system_stream(system_message:, user_content:, model: nil, on_delta: nil, format: nil)
      accumulated = +''
      result = @client.chat_stream(
        model: model,
        format: format,
        messages: [
          { role: 'system', content: system_message },
          { role: 'user', content: user_content }
        ]
      ) do |obj|
        delta = obj.dig('message', 'content').to_s
        next if delta.blank?

        accumulated << delta
        on_delta&.call(accumulated)
      end

      return result if self.class.response_error?(result)

      {
        model: result['model'],
        output: accumulated,
        raw: result
      }
    end

    private

    def parse_json_chat_result(response)
      content = response.dig('message', 'content')
      parsed = ResponseJson.parse_object(content)
      if parsed.nil?
        return {
          model: response['model'],
          output: content,
          raw: response,
          structured_output: false
        }
      end

      raw_payload = response.deep_dup
      raw_payload['message']['content'] = parsed if raw_payload['message'].is_a?(Hash)

      {
        model: response['model'],
        output: parsed,
        raw: raw_payload,
        structured_output: true
      }
    end
  end
end
