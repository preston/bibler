# frozen_string_literal: true

require 'json'

module Ollama
  module Prompts
    # System and user messages for POST /ai/comparator_commentary
    # Verse text in the user message context is loaded server-side from the database, not supplied by the client.
    module Comparator
      module_function

      # Tiny fixed CONTEXT + matching output shape — user message only; teaches structure before real data.
      ILLUSTRATIVE_CONTEXT = {
        chapter: 1,
        primary_bible: {
          uuid: '00000000-0000-0000-0000-00000000e1a1',
          name: 'Illustrative Translation A',
          abbreviation: 'ITA',
          language: 'en'
        },
        secondary_bible: {
          uuid: '00000000-0000-0000-0000-00000000e1b1',
          name: 'Illustrative Translation B',
          abbreviation: 'ITB',
          language: 'en'
        },
        primary_book: { uuid: '00000000-0000-0000-0000-00000000e2a1', name: 'Genesis' },
        secondary_book: { uuid: '00000000-0000-0000-0000-00000000e2b1', name: 'Genesis' },
        primary_verses: [
          { ordinal: 1, text: 'In the beginning God created the heavens and the earth.' },
          { ordinal: 2, text: 'And the earth was without form, and void; and darkness was upon the face of the deep.' }
        ],
        secondary_verses: [
          { ordinal: 1, text: 'When God began to create the heavens and the earth—' },
          { ordinal: 2, text: 'the earth was a formless void and darkness covered the face of the deep.' }
        ]
      }.freeze

      ILLUSTRATIVE_OUTPUT = {
        'verses' => [
          {
            'ordinal' => 1,
            'commentary' => 'ITA and ITB open with different time clauses; both affirm creatio ex nihilo but foreground syntax differently.',
            'linguistic_notes' => 'Hebrew בְּרֵאשִׁית (bərēʾšît) may be read as "in beginning" or "when God began".',
            'translation_issues' => '',
            'cultural_context' => '',
            'anthropological_context' => '',
            'translation_lens' => '',
            'grammar_notes' => '',
            'idiom_notes' => []
          },
          {
            'ordinal' => 2,
            'commentary' => '',
            'linguistic_notes' => '',
            'translation_issues' => '',
            'cultural_context' => '',
            'anthropological_context' => '',
            'translation_lens' => '',
            'grammar_notes' => '',
            'idiom_notes' => []
          }
        ]
      }.freeze

      def retry_enforcement_suffix
        <<~TXT.strip
          Your last message was not valid JSON. Reply with exactly one JSON object: root key "verses" only; one object per ordinal in primary_verses from the user CONTEXT JSON; every string must escape internal double quotes; no prose outside JSON.
        TXT
      end

      def ollama_output_format
        {
          'type' => 'object',
          'properties' => {
            'verses' => {
              'type' => 'array',
              'items' => {
                'type' => 'object',
                'properties' => {
                  'ordinal' => { 'type' => 'integer' },
                  'commentary' => { 'type' => 'string' },
                  'linguistic_notes' => { 'type' => 'string' },
                  'translation_issues' => { 'type' => 'string' },
                  'cultural_context' => { 'type' => 'string' },
                  'anthropological_context' => { 'type' => 'string' },
                  'translation_lens' => { 'type' => 'string' },
                  'grammar_notes' => { 'type' => 'string' },
                  'idiom_notes' => { 'type' => 'array', 'items' => { 'type' => 'string' } }
                },
                'required' => %w[
                  ordinal commentary linguistic_notes translation_issues cultural_context
                  anthropological_context translation_lens grammar_notes idiom_notes
                ]
              }
            }
          },
          'required' => ['verses']
        }
      end

      def system_prompt
        <<~PROMPT.strip
          #{Core::CORE_AI_RULES}

          YOUR TASK — TRANSLATION COMPARISON (Bibler)
          You compare two Bible translations for the same chapter. The user message contains CONTEXT JSON (loaded from our database) with parallel verses. Produce verse-level notes on how the two wordings differ in meaning, tone, or interpretation—not a generic essay.

          CONTEXT COORDINATES
          - "chapter" is the chapter number only.
          - Each row in "primary_verses" and "secondary_verses" is {"ordinal": N, "text": "..."} where N is the verse number within that chapter.
          - Cite translations by Bible "name" or "abbreviation" from the JSON. Never use the words "primary" or "secondary" in user-facing strings.

          COMMENTARY RULES
          - Use only verses and metadata from CONTEXT; do not invent ordinals or citations.
          - Up to about five sentences in "commentary" per verse when there is something useful; otherwise use "".
          - Do not paste full verse text into commentary (the user already sees both columns).
          - Where traditions differ on debated points, note Protestant, Catholic, and Orthodox angles when relevant.
          - Greek/Hebrew: transliteration and Strong’s numbers when helpful.
          - Skip nitpicks (punctuation only) unless meaning changes.

          OUTPUT — JSON SCHEMA (exact keys; root has only "verses")
          Return a single JSON object (no markdown fences, no text before or after):
          {
            "verses": [
              {
                "ordinal": <integer, same as in primary_verses for this row>,
                "commentary": "<string>",
                "linguistic_notes": "<string>",
                "translation_issues": "<string>",
                "cultural_context": "<string>",
                "anthropological_context": "<string>",
                "translation_lens": "<string>",
                "grammar_notes": "<string>",
                "idiom_notes": [ "<string>", ... ]
              }
            ]
          }
          Include exactly one object in "verses" for each entry in primary_verses (every ordinal). Use "" and [] for empty fields. Valid JSON: escape " and \\ inside strings.
        PROMPT
      end

      def user_content(context_hash)
        ctx = Context.normalize(
          context_hash,
          max_array_items: Context.comparator_max_array_items,
          max_string_chars: Context.comparator_max_string_chars
        )
        context_json = JSON.pretty_generate(ctx)
        max = Context.comparator_max_context_chars
        trimmed = context_json.length > max ? "#{context_json[0...max]}\n... [truncated]" : context_json

        illustrative_ctx = JSON.pretty_generate(ILLUSTRATIVE_CONTEXT)
        illustrative_out = JSON.pretty_generate(ILLUSTRATIVE_OUTPUT)

        <<~PROMPT
          PART A — PATTERN (structure only; your answer for the real passage must match this shape)

          The user message always includes CONTEXT JSON with: chapter, primary_bible, secondary_bible, primary_book, secondary_book, primary_verses[], secondary_verses[] (parallel rows share the same "ordinal").

          Example CONTEXT (illustrative labels ITA / ITB):
          #{illustrative_ctx}

          Example valid response for that example (same keys per verse; your commentary length will vary):
          #{illustrative_out}

          PART B — REAL PASSAGE (answer for this only)

          Produce one JSON object for the passage below. Include one "verses" entry per row in primary_verses (same ordinals). Follow the schema in your system message exactly.

          CONTEXT JSON:
          #{trimmed}
        PROMPT
      end
    end
  end
end
