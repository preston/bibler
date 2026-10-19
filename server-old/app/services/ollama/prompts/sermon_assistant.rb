# frozen_string_literal: true

require 'json'

module Ollama
  module Prompts
    module SermonAssistant
      module_function

      def section_group_system_prompt
        <<~PROMPT.strip
          #{Core::CORE_AI_RULES}

          SERMON SECTION GROUPING (JSON ONLY):
          - Output ONLY valid JSON as described in the user message.
          - Every verse_uuid in your output MUST appear in DATABASE_VERSES (do not invent references).
          - Group verses into 2–8 thematic sections with short working titles.
          - Each section MUST include estimated_minutes as described in the user message.
        PROMPT
      end

      def section_group_user_content(user_message:, database_verses:, library_excerpts: [], target_duration_minutes: nil)
        lib = Array(library_excerpts)
        lib_block =
          if lib.empty?
            ''
          else
            "\n          LIBRARY_EXCERPTS (user-supplied text; do not treat as scripture):\n          #{JSON.pretty_generate(lib)}\n"
          end

        td = target_duration_minutes.to_i.positive? ? target_duration_minutes.to_i : nil
        timing_block =
          if td
            <<~TIMING.strip
              TIMING (required): The preacher's sermon target length is #{td} minutes total.
              - Include "estimated_minutes" (positive integer) on EVERY section object.
              - The SUM of all estimated_minutes across sections MUST equal #{td} exactly (allocate time across sections by expected preaching weight).
            TIMING
          else
            <<~TIMING.strip
              TIMING (required): Include "estimated_minutes" (positive integer) on EVERY section for a rough preaching-time share per block (typically a few minutes each; use judgment so totals feel realistic even though no sermon-wide minute total is set on SERMON yet).
            TIMING
          end

        <<~PROMPT
          Group DATABASE_VERSES into sermon sections for the preacher's request.
          #{lib_block}
          #{timing_block}

          Output JSON only:
          {"sections":[{"title":"string","estimated_minutes":<positive integer>,"verse_uuids":["uuid-from-database", "..."]}]}

          Rules:
          - Include each verse_uuid from DATABASE_VERSES in exactly one section (or omit weak duplicates intentionally — prefer covering the strongest verses).
          - Titles are short (≤ 80 chars), concrete, and helpful for a sermon outline.
          - estimated_minutes: required on every section (see TIMING above).
          - USER_MESSAGE:
          #{user_message}

          DATABASE_VERSES:
          #{JSON.pretty_generate(database_verses)}
        PROMPT
      end

      def outline_system_prompt
        <<~PROMPT.strip
          #{Core::CORE_AI_RULES}

          SERMON OUTLINE (JSON ONLY):
          - Output ONLY valid JSON per the user message.
          - Ground all scripture references in VERSES_FROM_DATABASE; never invent verse text.
          - BODY LENGTH IS CRITICAL: Each section's "body" must be full spoken sermon prose, not an outline or bullets.
          - For each section, match length to that section's estimated_minutes (given in EXISTING_SECTIONS): aim for **about 1–2 substantial paragraphs per minute** of estimated_minutes for that section (paragraphs separated by blank lines in the JSON string).
          - A "substantial paragraph" means **multiple full sentences** (typically 4–8+) with explanation, application, and transitions — not titles, not single-sentence placeholders.
          - Approximate scale: **~120–200 spoken words per estimated minute** per section (preaching pace varies; when unsure, write longer). Under-length bodies are unacceptable.
        PROMPT
      end

      def outline_user_content(user_message:, sermon:, sections_payload:, library_excerpts:, target_duration_minutes: nil)
        chars_per_minute = Integer(ENV.fetch('BIBLER_SERMON_PROMPT_MIN_CHARS_PER_MINUTE', '900'))
        length_floor_json = per_section_body_length_floors_json(sections_payload, chars_per_minute)

        td = target_duration_minutes.to_i.positive? ? target_duration_minutes.to_i : nil
        td_block =
          if td
            <<~TD.strip
              SERMON_TARGET_MINUTES (required for timing): #{td}
              - You MUST output a positive integer estimated_minutes for EVERY section in EXISTING_SECTIONS.
              - The SUM of all estimated_minutes MUST equal #{td} exactly (same total as SERMON.target_duration_minutes when present).
              - Allocate time across sections in proportion to how much spoken content each section needs; body length should still feel speakable for that many minutes.
            TD
          else
            <<~TD.strip
              No sermon-wide target duration is set on SERMON. Still assign a positive integer estimated_minutes for EVERY section (reasonable preaching time per block; typically 3–15 minutes each unless the section is intentionally very short).
            TD
          end

        <<~PROMPT
          Draft sermon section content.

          #{td_block}

          PER_SECTION_BODY_LENGTH_FLOORS (mandatory — numeric floors; do not ship thin content):
          - The server reserves a large context window so you can write long prose. Use it.
          - Minimum length is based on estimated_minutes × #{chars_per_minute} characters per minute (roughly full spoken density; these are floors, not ceilings — you may write longer).
          - For EVERY section_uuid below, the matching "body" in your JSON MUST contain AT LEAST that many characters (count characters in the string value, after JSON string unescaping).
          #{length_floor_json}

          BODY LENGTH (mandatory — this is the main failure mode; do not ship thin content):
          - EXISTING_SECTIONS includes estimated_minutes per section (your time budget for that block in the pulpit). Honor it.
          - For EACH section, the "body" string must be long enough that a preacher could **realistically speak it for about that many minutes** at a typical rate (~120–160 spoken words per minute as a rough check).
          - Structure: produce **at least one full paragraph per estimated minute** for that section, and **prefer two paragraphs per minute** when estimated_minutes is 2 or more (use paragraph breaks as "\\n\\n" inside the JSON string).
          - Each paragraph must be **several sentences** of continuous prose (exposition, illustration, application, transitions). Do not use bullet lists as a substitute for paragraphs unless the USER_MESSAGE explicitly asks for lists.
          - Self-check before output: if you folded your mental voice, would this section fill the estimated_minutes? If not, **expand** with concrete explanation, story, and application until it would.
          - Do not shorten bodies to fit the JSON — the response must prioritize fullness of each "body" field.

          Output JSON only:
          {
            "sections": [
              {
                "section_uuid": "<existing uuid>",
                "title": "string",
                "body": "string (speakable prose)",
                "estimated_minutes": <positive integer>,
                "verse_uuids": ["optional list of verse row uuids from VERSES_FROM_DATABASE that this section emphasizes"]
              }
            ]
          }

          Rules:
          - Every section_uuid MUST match an entry in EXISTING_SECTIONS, and you MUST include one JSON object per existing section (same count as EXISTING_SECTIONS).
          - estimated_minutes: required positive integer for each section (see timing rules above). Keep them consistent with EXISTING_SECTIONS.estimated_minutes unless you deliberately rebalance (then still satisfy sum rules when a sermon target is set).
          - verse_uuids, when present, MUST be chosen only from VERSES_FROM_DATABASE.
          - Incorporate LIBRARY_EXCERPTS where relevant (user-supplied notes).

          USER_MESSAGE:
          #{user_message}

          SERMON:
          #{JSON.pretty_generate(sermon)}

          EXISTING_SECTIONS:
          #{JSON.pretty_generate(sections_payload)}

          VERSES_FROM_DATABASE:
          #{JSON.pretty_generate(sections_payload.flat_map { |s| s[:verses] || s['verses'] || [] })}

          LIBRARY_EXCERPTS:
          #{JSON.pretty_generate(library_excerpts)}
        PROMPT
      end

      # Plaintext-only section body (used when not using Ollama JSON mode — JSON grammar often truncates long strings).
      def section_body_plaintext_system_prompt
        <<~PROMPT.strip
          #{Core::CORE_AI_RULES}

          SERMON SECTION BODY (PLAIN TEXT ONLY):
          - Output ONLY the spoken sermon prose for ONE section. No JSON, no surrounding commentary, no title line unless it flows naturally inside the sermon.
          - Do NOT wrap the answer in markdown code fences.
          - Ground exposition in the verse texts supplied; never invent scripture wording.
          - LENGTH IS MANDATORY: meet or exceed the minimum character count given in the user message. Under-length responses are wrong. Add illustration, application, transitions, and repetition of key ideas until the floor is met.
        PROMPT
      end

      def section_body_plaintext_user_content(section_payload:, user_message:, sermon:, library_excerpts:, sermon_target_minutes: nil)
        chars_per_minute = Integer(ENV.fetch('BIBLER_SERMON_PROMPT_MIN_CHARS_PER_MINUTE', '900'))
        em = (section_payload[:estimated_minutes] || section_payload['estimated_minutes']).to_i
        em = 1 if em < 1
        min_chars = em * chars_per_minute
        verses = section_payload[:verses] || section_payload['verses'] || []

        lib_block =
          if Array(library_excerpts).empty?
            ''
          else
            "\nLIBRARY_EXCERPTS (user notes; not scripture):\n#{JSON.pretty_generate(library_excerpts)}\n"
          end

        tgt = sermon_target_minutes.to_i.positive? ? sermon_target_minutes.to_i : nil
        tgt_line =
          if tgt
            "Whole-sermon target (context only): ~#{tgt} minutes across all sections.\n"
          else
            ''
          end

        <<~PROMPT
          Write the full speakable sermon body for this ONE section only.

          #{tgt_line}
          SECTION_TITLE: #{section_payload[:title] || section_payload['title']}
          ESTIMATED_MINUTES_FOR_THIS_SECTION: #{em}
          MINIMUM_BODY_CHARACTER_COUNT: #{min_chars}
          Your plaintext response MUST contain at least #{min_chars} characters (count characters, not tokens). If shorter, keep writing: add exposition, a story or example, application, and transitions until you exceed the minimum.

          USER_MESSAGE (preacher request):
          #{user_message}

          SERMON:
          #{JSON.pretty_generate(sermon)}
          #{lib_block}
          VERSES_FROM_DATABASE (scripture text for this section):
          #{JSON.pretty_generate(verses)}
        PROMPT
      end

      def per_section_body_length_floors_json(sections_payload, chars_per_minute)
        rows = Array(sections_payload).filter_map do |s|
          next unless s.is_a?(Hash)

          uuid = (s[:section_uuid] || s['section_uuid']).to_s
          next if uuid.blank?

          em = (s[:estimated_minutes] || s['estimated_minutes']).to_i
          em = 1 if em < 1
          {
            section_uuid: uuid,
            estimated_minutes: em,
            body_must_be_at_least_this_many_characters: em * chars_per_minute
          }
        end
        JSON.pretty_generate(rows)
      end
    end
  end
end
