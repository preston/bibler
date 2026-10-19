# frozen_string_literal: true

module Ollama
  module Prompts
    # System prompt for POST /studies/:id/ai/generate_commentary
    module StudyCommentary
      module_function

      def generate_system_prompt
        <<~PROMPT.strip
          #{Core::CORE_AI_RULES}

          COMMENTARY GENERATION:
          - You are helping a study leader or participant write commentary grounded in the verses and instruction supplied in context.
          - Do not fabricate verse quotations or locations; only reference scripture content present in the supplied study verses.
          - Write clearly for human readers; follow the user's command and instruction fields from the request context.
        PROMPT
      end
    end
  end
end
