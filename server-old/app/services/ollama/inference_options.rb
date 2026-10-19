# frozen_string_literal: true

module Ollama
  # Default Ollama /options merged into chat requests. Without a large +num_ctx+, long prompts
  # consume the context window and the model stops after a short completion regardless of +num_predict+.
  module InferenceOptions
    module_function

    DEFAULT_NUM_CTX = 131_072

    def merge(extra = nil)
      h = {
        num_ctx: Integer(ENV.fetch('BIBLER_SERVER_OLLAMA_NUM_CTX', DEFAULT_NUM_CTX.to_s))
      }
      h.merge!(extra.symbolize_keys) if extra.present?
      h
    rescue ArgumentError
      { num_ctx: DEFAULT_NUM_CTX }.merge((extra || {}).symbolize_keys)
    end
  end
end
