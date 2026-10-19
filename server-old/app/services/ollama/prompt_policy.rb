# frozen_string_literal: true

require 'json'

module Ollama
  # Public facade for LLM prompts and context shaping. Implementation lives in
  # `Ollama::Prompts::*` — see `app/services/ollama/prompts/`.
  class PromptPolicy
    # Backward-compatible name for core study rules (same string as {Prompts::Core::CORE_AI_RULES}).
    DEFAULT_STUDY_AI_SYSTEM_PROMPT = Prompts::Core::CORE_AI_RULES

    def self.system_message
      Prompts::Core::CORE_AI_RULES
    end

    def self.effective_study_system_prompt(study)
      study_assistant_suggestions_system_prompt(study)
    end

    def self.study_assistant_search_system_prompt(_study)
      Prompts::StudyAssistant.search_system_prompt
    end

    def self.study_assistant_suggestions_system_prompt(_study)
      Prompts::StudyAssistant.suggestions_system_prompt
    end

    def self.study_generate_commentary_system_prompt(_study)
      Prompts::StudyCommentary.generate_system_prompt
    end

    def self.comparator_commentary_system_prompt
      Prompts::Comparator.system_prompt
    end

    def self.comparator_commentary_user_content(context_hash)
      Prompts::Comparator.user_content(context_hash)
    end

    def self.compose(prompt:, context:)
      context_json = JSON.pretty_generate(Prompts::Context.normalize(context))
      max = Prompts::Context.max_context_chars
      if context_json.length > max
        context_json = "#{context_json[0...max]}\n... [truncated]"
      end

      <<~PROMPT
        #{Prompts::Core::CORE_AI_RULES}

        USER REQUEST:
        #{prompt.presence || 'Provide a biblically grounded response from the supplied context.'}

        STUDY CONTEXT JSON:
        #{context_json}
      PROMPT
    end

    def self.normalize_context(value)
      Prompts::Context.normalize(value)
    end

    def self.max_context_chars
      Prompts::Context.max_context_chars
    end

    def self.max_array_items
      Prompts::Context.max_array_items
    end

    def self.max_string_chars
      Prompts::Context.max_string_chars
    end
  end
end
