# frozen_string_literal: true

require 'json'

module Ollama
  module Prompts
    # System prompts and user message templates for {StudyAssistantOrchestrator}.
    module StudyAssistant
      module_function

      # Cap verses embedded in round 2 so the model stays within context and can finish valid JSON.
      ROUND_B_VERSE_CAP = 80
      SERMON_INTENT_HINT = /\b(sermon|sermons|homily|preach|preaching)\b/i

      def search_system_prompt
        <<~PROMPT.strip
          #{Core::CORE_AI_RULES}

          SEARCH PLANNING (ROUND 1) — ADDITIONAL RULES:
          - You output ONLY the JSON object described in the user message (no markdown).
          - Goal: produce enough DISTINCT, high-recall database searches that Round 2 receives a rich mix of verses for the user's topic. Under-searching is a failure mode.
          - Each search "text" must be a few simple KEYWORDS or a very SHORT PHRASE (about 1–4 words) suitable for PostgreSQL full-text search (pg_search) on verse text in that Bible. Do NOT use long questions or conversational sentences as search text.
          - Prefer MANY separate search objects (aim for roughly 8–18 when the topic is broad: people, places, events, virtues, temptations, family, worship, etc.). Use fewer only when the user asks for something extremely narrow.
          - Lexical search matches words that appear IN THE TRANSLATION. Think: "What words would actually be printed in this Bible for this theme?" Use names, places, and concrete nouns/verbs from scripture (e.g. for Mary: "Mary", "Elizabeth", "manger", "Nazareth", "Magnificat" may not appear — prefer words you know occur in many English Bibles such as "Mary", "mother", "virgin", "angel", "child", "temple", "cross", etc.).
          - Cover the topic from several angles with different keywords, not one long phrase. If one phrasing might miss (synonyms), add another search with different keywords.
          - Each "bible_uuid" MUST appear in REFERENCE_BIBLES below (only system Bibles flagged for AI assistant use — not the full server catalog). By default that list is the English AI Bible only; when the user's request clearly concerns original languages, the server expands it to other AI defaults (Hebrew/Greek/etc.). Use the uuid(s) actually listed.
          - Match the language of search terms to the Bible's language (see BIBLES_CATALOG / REFERENCE_BIBLES). Default to English keywords on the English Bible unless the user asked for non-English lookup or REFERENCE_BIBLES lists additional languages.
          - This is lexical/SQL search, not semantic retrieval: prefer distinctive words likely to appear verbatim in the translation. Avoid abstract jargon unlikely to appear as-is (e.g. prefer "tempt" / "wilderness" / "Satan" over "peer pressure").
          - Optional "limit" per search (≤25): use lower limits for very common words (e.g. "Lord", "God") and higher for specific terms, so the combined result set stays useful and not dominated by one generic term.
        PROMPT
      end

      def suggestions_system_prompt
        <<~PROMPT.strip
          #{Core::CORE_AI_RULES}

          SUGGESTION DRAFTING (ROUND 2) — ADDITIONAL RULES:
          - You output ONLY the JSON object described in the user message (no markdown).
          - Follow ORIGINAL_USER_MESSAGE_AND_INSTRUCTIONS and STUDY_SNAPSHOT (especially study.goal and study.plan_total_duration_minutes) when shaping suggestions.
          - Suggestions must be actionable for a study leader: clear titles, substantive summaries, and correct payload fields.
          - Ground every add_verse in DATABASE_RESULTS (verse text and identifiers) or in STUDY_SNAPSHOT.verses. Never invent verse text or references.
          - If DATABASE_RESULTS has few verses, still produce helpful add_commentary, add_question, add_task, and add_worship items that fit the user's request, clearly scoped to what scripture in DATABASE_RESULTS does support, and use questions/tasks/worship where application is broader than the verse hits.
          - Summaries are plan-step notes: about one sentence up to two short paragraphs where helpful.
          - When the user message includes a TARGET_DURATION_MINUTES section, obey it exactly: every suggestion must have a top-level integer "duration", and the sum of all durations must equal that target (see rules in the user message).
        PROMPT
      end

      def round_a_user_content(user_message:, snapshot:, catalog:, selected_refs:, max_search_items:)
        <<~PROMPT
          ROUND 1 — SEARCH PLAN (JSON ONLY)

          Output a single JSON object and nothing else (no markdown fences, no commentary).
          Shape:
          {"searches":[{"bible_uuid":"...","text":"search phrase","limit":10}]}

          Rules:
          - Every bible_uuid MUST be listed in REFERENCE_BIBLES / BIBLES_CATALOG below (only system AI-flagged translations — never invent uuids). By default these blocks list the English AI Bible only: use English keywords and that bible_uuid for all searches unless the user explicitly asked for original-language lookup and additional languages appear in REFERENCE_BIBLES.
          - At most #{max_search_items} search objects.
          - Each limit must be <= 25.
          - Each "text" must be SHORT: about 1–4 words that will match verse text via PostgreSQL full-text search. Use the language of that Bible's translation. Do NOT use long natural-language questions.
          - This is SQL-backed keyword search, not semantic/embedding search. Use several different searches rather than one search with many AND-required words.
          - Aim for broad topical coverage: for a lesson plan, sermon, or multi-part study request, emit many searches (often 8–18) so overlapping themes still yield verses even if some terms are sparse.
          - STRATEGY (internal reasoning — do not echo): (1) List concrete biblical vocabulary for the request (people, places, events, objects). (2) For each, emit 1–2 search lines with wording likely to appear in the translation. (3) Add thematic words (temptation → temptation, devil, wilderness; honoring parents → honor, father, mother, commandment).
          - BAD text examples (too vague or conversational): "lesson about Mary for one hour", "what Catholics believe about rituals", "help youth with peer pressure".
          - GOOD text examples (short, lexical, translation-aligned): "Mary", "mother", "Elizabeth", "angel", "temple", "cross" (each as its own search line with a bible_uuid); "temptation", "wilderness", "Satan"; "honor", "father", "mother".

          USER_MESSAGE:
          #{user_message}

          STUDY_SNAPSHOT:
          #{JSON.pretty_generate(snapshot)}

          BIBLES_CATALOG (AI-flagged translations only; same scope as REFERENCE_BIBLES):
          #{JSON.pretty_generate(catalog)}

          REFERENCE_BIBLES:
          #{JSON.pretty_generate(selected_refs)}
        PROMPT
      end

      def round_b_user_content(
        user_message:,
        snapshot:,
        catalog:,
        selected_refs:,
        search_result:,
        max_suggestions:,
        suggestion_types:,
        target_duration_minutes: nil
      )
        verses_all = search_result[:verses].is_a?(Array) ? search_result[:verses] : []
        verse_count = verses_all.size
        verses_for_prompt = verses_all.first(ROUND_B_VERSE_CAP)
        omitted = verse_count - verses_for_prompt.size
        verse_scope_note =
          if omitted.positive?
            "\n          - DATABASE_RESULTS include the first #{verses_for_prompt.size} of #{verse_count} verses returned by search (remainder omitted only to save context; base suggestions on these)."
          else
            ''
          end
        sparse = verse_count < 8
        sparse_hint = if sparse
                        <<~HINT.strip
                          DATABASE_RESULTS look sparse (#{verse_count} verses). Still return useful suggestions:
                          - Prioritize add_verse for the best-matching verses present.
                          - Add add_question / add_task / add_commentary to structure the user's session (timing, discussion, application) while staying honest about what the verses support.
                        HINT
                      else
                        ''
                      end

        target_duration_block =
          if target_duration_minutes.to_i.positive?
            td = target_duration_minutes.to_i
            <<~BLOCK.strip
              TARGET_DURATION_MINUTES (required session length for NEW suggestions — HARD REQUIREMENT):
              - The study leader asked for suggestions that fill #{td} minutes total for this session. Allocate all #{td} minutes across the suggestions you output.
              - EVERY suggestion MUST include a top-level integer "duration" (minutes) >= 0. The SUM of every "duration" in the "suggestions" array MUST equal #{td} exactly — not less, not more. Split time sensibly (e.g. discussion vs reading vs worship) but the arithmetic must be exact.
              - If you only output one suggestion, its "duration" must be #{td}.
            BLOCK
          else
            ''
          end

        sermon_long_form_block =
          if user_message.to_s.match?(SERMON_INTENT_HINT)
            <<~BLOCK.strip
              SERMON LONG-FORM MODE (applies because the user asked for a sermon/homily/preaching content):
              - Ignore normal brevity limits for writing quality and depth.
              - For add_commentary (and any summary that is drafting manuscript-style text), write long-form prose suitable for spoken delivery.
              - Target approximately one minute of speaking per paragraph (about 130-170 words per paragraph).
              - Prefer complete manuscript-style paragraphs over short bullets.
            BLOCK
          else
            ''
          end

        <<~PROMPT
          ROUND 2 — SUGGESTIONS (JSON ONLY)

          Use STUDY_SNAPSHOT below for study goal (study.goal) and existing plan duration hint (study.plan_total_duration_minutes). The leader's instructions for this request are under ORIGINAL_USER_MESSAGE_AND_INSTRUCTIONS.

          Output a single JSON object and nothing else (no markdown fences, no commentary).
          Shape:
          {"suggestions":[{"id":"stable-id","type":"add_verse","title":"short title","summary":"why this helps","payload":{}}]}

          Rules:
          - At most #{max_suggestions} suggestions.
          - type must be one of: #{Array(suggestion_types).join(', ')}.
          #{target_duration_block}
          - When TARGET_DURATION_MINUTES is not set above: optional duration per suggestion as an integer minutes estimate >= 0. Use 0 only when intentionally unspecified.
          - For add_verse payload: REQUIRED verse_uuid (string) — MUST match a verse_uuid from DATABASE_RESULTS.verses or an entry in STUDY_SNAPSHOT.verses. Optional note. Do not paste full verse text into the payload; coordinates are derived server-side from verse_uuid.
          - For add_commentary: source_type (manual|ai), title, body, optional prompt, optional duration.
          - For add_question: prompt, question_type (discussion|observation|interpretation|application), optional guidance_notes, optional duration.
          - For add_task: instruction, task_type (discussion|reading|prayer|memorization|reflection|create), optional assignee_label, optional duration.
          - `task_type` MUST be exactly one of those values above; never invent a new task_type label.
          - For add_worship: optional resource_url (string), optional worship_format (song|video|other), optional note in payload; use title and summary for the plan step.
          - Never invent verse text; summaries may paraphrase only what DATABASE_RESULTS contain.
          #{sermon_long_form_block}
          - Each "summary" is stored as the plan step's notes in the UI:
            - For sermon requests: do not use normal short-note limits; allow long-form writing, with about one minute of speaking per paragraph.
            - For non-sermon requests: aim for about one sentence up to two short paragraphs (not only a title or a single short phrase unless that truly suffices).
            - In all cases, stay grounded in DATABASE_RESULTS and STUDY_SNAPSHOT.
          - Order suggestions by priority: the first suggestion in the array is the most important; preserve that order in the JSON array.
          #{sparse_hint}
          #{verse_scope_note}

          ORIGINAL_USER_MESSAGE_AND_INSTRUCTIONS:
          #{user_message}

          STUDY_SNAPSHOT:
          #{JSON.pretty_generate(snapshot)}

          BIBLES_CATALOG (AI-flagged translations only; same scope as REFERENCE_BIBLES):
          #{JSON.pretty_generate(catalog)}

          REFERENCE_BIBLES:
          #{JSON.pretty_generate(selected_refs)}

          DATABASE_RESULTS:
          #{JSON.pretty_generate(verses: verses_for_prompt, errors: search_result[:errors])}
        PROMPT
      end
    end
  end
end
