# frozen_string_literal: true

module Ollama
  class StudyAssistantOrchestrator
    MAX_SUGGESTIONS = 16
    MAX_SEARCH_ITEMS = 20
    SUGGESTION_TYPES = %w[add_verse add_commentary add_question add_task add_worship].freeze

    # Words unlikely to help lexical Bible search or too generic at high limits
    FALLBACK_STOP_WORDS = %w[
      that this with from have been were they will your what when shall unto thee thou which about their there
      minute minutes hour hours lesson study plan youth sermon elementary school children group discussion break
      create covering adding named whole thing things need needs want wants would could should please help
      such certain many much more very also only into than then them these those some same well just like
    ].freeze

    # If the user asks about Hebrew/Greek/LXX/etc., include all system AI-default translations in search + prompts.
    NON_ENGLISH_SEARCH_HINT = /\b(
      hebrew|hbo|aramaic|syriac|greek|septuagint|lxx|masoretic|interlinear|vulgate|latin
      |original\s+language|dead\s+sea|byzantine|critical\s+edition|transliteration
      |strong(?:'s|s)?|lookup\s+in\s+hebrew|in\s+greek|in\s+hebrew|hebrew\s+word|greek\s+word
    )\b/ix.freeze

    def initialize(study:, user_message:, model: nil, chat_service: nil, on_event: nil, stream: false, target_duration_minutes: nil)
      @study = study
      @user_message = user_message.to_s.strip
      @model = model
      @chat = chat_service || ChatService.new
      @on_event = on_event
      @stream = stream
      @target_duration_minutes = normalize_target_duration_param(target_duration_minutes)
    end

    def call
      return { error: 'User message is blank.' } if @user_message.blank?

      Rails.logger.info(
        "[StudyAssistant] start study_uuid=#{@study.uuid} stream=#{@stream} message_chars=#{@user_message.length}"
      )

      emit('started', {})
      system_search = Prompts::StudyAssistant.search_system_prompt
      system_suggestions = Prompts::StudyAssistant.suggestions_system_prompt
      snapshot = build_study_snapshot
      selected_refs = reference_bibles_for_search
      catalog = build_ai_prompt_bible_rows(selected_refs)
      Rails.logger.info(
        "[StudyAssistant] reference_bible_count=#{selected_refs.size} uuids=#{selected_refs.map { |b| b[:uuid] }.join(',')}"
      )

      emit('status', { phase: 'planning', message: 'Planning database searches…' })
      round_a_content = Prompts::StudyAssistant.round_a_user_content(
        user_message: @user_message,
        snapshot: snapshot,
        catalog: catalog,
        selected_refs: selected_refs,
        max_search_items: MAX_SEARCH_ITEMS
      )
      a_resp = run_llm_round(system: system_search, user_content: round_a_content, round: 'a')
      return emit_error_and_return(a_resp) if ChatService.response_error?(a_resp)

      plan = ResponseJson.parse_object(a_resp[:output].to_s) || {}
      searches = normalize_searches(plan['searches'] || plan[:searches])
      searches = constrain_searches_to_reference_bibles(searches, selected_refs)
      used_fallback = false
      emit('plan', { searches: searches_summary_for_ui(searches) })
      Rails.logger.info("[StudyAssistant] round_a searches_count=#{searches.size}")

      emit('status', { phase: 'searching', message: 'Searching your Bibles…' })
      search_result = BibleStudySearchService.call(searches: searches)
      if search_result[:verses].blank?
        Rails.logger.warn('[StudyAssistant] Verse search returned 0 rows; applying fallback lexical searches (English primary)')
        used_fallback = true
        searches = fallback_lexical_searches(primary_bible_uuid: primary_search_bible_uuid(selected_refs))
        searches = constrain_searches_to_reference_bibles(searches, selected_refs)
        emit('plan', { searches: searches_summary_for_ui(searches) })
        search_result = BibleStudySearchService.call(searches: searches)
      end
      emit('search_results', search_results_payload(search_result))
      Rails.logger.info(
        "[StudyAssistant] search_done verse_count=#{search_result[:verses].size} fallback=#{used_fallback} errors=#{Array(search_result[:errors]).size}"
      )

      emit('status', { phase: 'drafting', message: 'Drafting suggestions…' })
      round_b_content = Prompts::StudyAssistant.round_b_user_content(
        user_message: @user_message,
        snapshot: snapshot,
        catalog: catalog,
        selected_refs: selected_refs,
        search_result: search_result,
        max_suggestions: MAX_SUGGESTIONS,
        suggestion_types: SUGGESTION_TYPES,
        target_duration_minutes: @target_duration_minutes
      )
      b_resp = run_llm_round(system: system_suggestions, user_content: round_b_content, round: 'b')
      return emit_error_and_return(b_resp) if ChatService.response_error?(b_resp)

      raw_out = b_resp[:output].to_s
      parsed = ResponseJson.parse_object(raw_out)
      raw_list = extract_suggestions_list_from_parsed(parsed)
      suggestions = normalize_suggestions(raw_list)
      apply_target_duration_scaling!(suggestions) if @target_duration_minutes&.positive?
      if suggestions.empty?
        Rails.logger.warn(
          "[StudyAssistant] round_b 0 suggestions after normalize; parsed_class=#{parsed.class} " \
            "output_preview=#{raw_out[0, 800].inspect}"
        )
      end
      Rails.logger.info("[StudyAssistant] complete suggestion_count=#{suggestions.size}")

      debug = build_debug_payload(searches: searches, search_result: search_result, selected_refs: selected_refs)
      payload = { suggestions: suggestions, debug: debug }
      emit('complete', payload)
      payload
    end

    private

    def emit_error_and_return(resp)
      msg = resp[:error].presence || resp['error'].presence || 'Unknown error'
      hint = resp[:hint].presence || resp['hint'].presence
      Rails.logger.warn("[StudyAssistant] error study_uuid=#{@study.uuid} msg=#{msg} hint=#{hint}")
      emit('error', { error: msg.to_s, hint: hint }.compact)
      resp
    end

    def emit(event, data)
      @on_event&.call({ event: event, data: data })
    end

    def run_llm_round(system:, user_content:, round:)
      json_round = round == 'a' || round == 'b'
      if @stream
        # Do not stream raw tokens to the client; phases use emit('status', …) only.
        @chat.chat_with_system_stream(
          system_message: system,
          user_content: user_content,
          model: @model,
          format: (json_round ? 'json' : nil),
          on_delta: nil
        )
      else
        @chat.chat_with_system(
          system_message: system,
          user_content: user_content,
          model: @model,
          ollama_format: (json_round ? 'json' : nil)
        )
      end
    end

    def searches_summary_for_ui(searches)
      searches.map do |s|
        s = s.symbolize_keys
        bible = BibleStudySearchService.resolve_bible(s[:bible_uuid])
        {
          bible_uuid: bible&.uuid,
          bible_name: bible&.name,
          query_preview: s[:text].to_s.truncate(100),
          limit: s[:limit]
        }
      end
    end

    def search_results_payload(search_result)
      verses = search_result[:verses]
      errors = Array(search_result[:errors]).map(&:to_s)
      by_uuid = verses.group_by { |v| v[:bible_uuid].to_s }
      by_bible = by_uuid.map do |uuid, rows|
        name = Bible.find_by(id: uuid)&.name
        { bible_uuid: uuid, bible_name: name, count: rows.size }
      end
      {
        verse_count: verses.size,
        by_bible: by_bible,
        errors: errors
      }
    end

    def build_study_snapshot
      {
        study: @study.slice(:uuid, :title, :goal, :visibility).merge(
          plan_total_duration_minutes: plan_items_total_duration_minutes
        ),
        verses: @study.study_verses.ordered.includes(:verse).map { |sv| study_verse_snapshot_hash(sv) },
        commentaries: @study.study_commentaries.ordered.map { |c| c.slice(:uuid, :source_type, :title, :body) },
        questions: @study.study_questions.ordered.map do |q|
          {
            uuid: q.uuid,
            prompt: q.prompt,
            question_type: q.question_type,
            guidance_notes: q.guidance_notes,
            verse_anchor: q.verse_anchor,
            answers: q.study_answers.order(created_at: :desc).limit(8).map { |a| a.slice(:response, :author_label, :visibility) }
          }
        end,
        tasks: @study.study_tasks.ordered.map { |t| t.slice(:uuid, :instruction, :task_type, :status, :assignee_label) }
      }
    end

    def plan_items_total_duration_minutes
      @study.study_plan_items.where('duration > 0').sum(:duration).to_i
    end

    # Full table — used only to resolve Bible.default_ai_reference_bibles UUIDs and English fallbacks (never sent to the LLM).
    def build_bibles_catalog
      Bible.order(:id).map do |b|
        b.slice(:id, :uuid, :name, :abbreviation, :language, :license, :created_at, :updated_at).symbolize_keys
      end
    end

    def build_ai_prompt_bible_rows(rows)
      rows.map do |b|
        b.slice(:id, :uuid, :name, :abbreviation, :language, :license, :created_at, :updated_at).symbolize_keys
      end
    end

    # System AI default Bibles only (same as Bible.default_ai_reference_bibles), resolved to full catalog rows.
    def selected_reference_bibles
      pool = build_bibles_catalog.index_by { |b| b[:uuid] }
      rows = Bible.default_ai_reference_bibles.values.compact.filter_map do |slice|
        next if slice.blank?

        u = slice['uuid'].presence || slice[:uuid].presence
        pool[u] if u.present?
      end
      rows = english_default_rows(pool) if rows.empty?
      rows = rows.compact.uniq { |b| b[:uuid] }
      order_reference_bibles_english_first(rows)
    end

    # Search + LLM REFERENCE_BIBLES: defaults to the English AI Bible only; expands to all AI-flagged translations
    # when the user clearly asks for original-language / non-English lookup.
    def reference_bibles_for_search
      refs = selected_reference_bibles
      refs = ensure_english_primary_for_assistant(refs)
      refs.uniq! { |b| b[:uuid] }

      if user_requested_non_english_bible_search?
        Rails.logger.info('[StudyAssistant] search_scope=multi_language_ai_defaults')
        refs
      else
        Rails.logger.info('[StudyAssistant] search_scope=english_ai_default_only')
        english_rows = refs.select { |r| english_language_code?(r[:language]) }
        if english_rows.any?
          [english_rows.first]
        elsif refs.any?
          [refs.first]
        else
          []
        end
      end
    end

    def user_requested_non_english_bible_search?
      @user_message.match?(NON_ENGLISH_SEARCH_HINT)
    end

    def english_default_rows(by_uuid)
      slice = Bible.default_ai_reference_bibles[:english]
      row = slice.present? ? by_uuid[slice['uuid']] : nil
      row ||= begin
        fb = Bible.by_language_fallback(%w[en])
        fb ? by_uuid[fb.uuid] : nil
      end
      row ? [row] : []
    end

    def order_reference_bibles_english_first(rows)
      eng_uuid = Bible.default_ai_reference_bibles[:english]&.dig('uuid')
      return rows if eng_uuid.blank?

      rows.sort_by { |r| r[:uuid].to_s == eng_uuid.to_s ? 0 : 1 }
    end

    # If defaults are only non-English, prepend English for lexical search.
    def ensure_english_primary_for_assistant(refs)
      return refs if refs.any? { |r| english_language_code?(r[:language]) }

      eng = english_default_rows(build_bibles_catalog.index_by { |b| b[:uuid] })
      return refs if eng.empty?

      ([eng.first] + refs).uniq { |b| b[:uuid] }
    end

    def english_language_code?(lang)
      code = lang.to_s.downcase
      return true if code == 'en'
      # Locale tags: en-us, en_uk — not "enm" (Middle English) which starts with "en" as a substring
      code.start_with?('en-') || code.start_with?('en_')
    end

    def primary_search_bible_uuid(refs)
      refs.first&.[](:uuid).to_s.presence
    end

    def fallback_lexical_searches(primary_bible_uuid:)
      return [] if primary_bible_uuid.blank?

      msg = @user_message.downcase
      words = msg.scan(/[a-z][a-z'-]{2,}/i).map(&:downcase).uniq
      words.reject! { |w| FALLBACK_STOP_WORDS.include?(w) || w.length > 22 }
      words.concat(%w[god lord jesus christ faith love]) if words.length < 6
      words = words.uniq.first(MAX_SEARCH_ITEMS)
      words.map.with_index do |w, i|
        { text: w, bible_uuid: primary_bible_uuid, limit: i < 4 ? 10 : 18 }
      end
    end

    def constrain_searches_to_reference_bibles(searches, allowed_ref_rows)
      allowed_uuids = allowed_ref_rows.map { |b| b[:uuid].to_s }.uniq
      return [] if allowed_uuids.empty?

      searches.filter_map do |s|
        s = s.symbolize_keys
        text = s[:text].to_s.strip
        next nil if text.blank?

        uuid = s[:bible_uuid].to_s.presence
        if uuid.blank?
          uuid = allowed_uuids.first
          if allowed_uuids.length == 1
            Rails.logger.info('[StudyAssistant] search omitted bible_uuid; defaulting to sole reference Bible')
          else
            Rails.logger.warn('[StudyAssistant] search omitted bible_uuid; defaulting to first reference Bible (include bible_uuid on each search when using multiple translations)')
          end
        elsif allowed_uuids.exclude?(uuid)
          Rails.logger.warn("[StudyAssistant] dropping search: bible_uuid #{uuid} not in allowed reference set")
          next nil
        end

        row = { text: text, bible_uuid: uuid }
        row[:limit] = s[:limit] if s[:limit].present?
        row
      end
    end

    def normalize_searches(list)
      return [] unless list.is_a?(Array)

      list.first(MAX_SEARCH_ITEMS).filter_map do |item|
        next unless item.is_a?(Hash)

        h = item.symbolize_keys
        text = h[:text].to_s.strip
        next if text.blank?

        row = { text: text }
        row[:bible_uuid] = h[:bible_uuid].to_s.presence if h[:bible_uuid].present?
        row[:limit] = h[:limit] if h[:limit].present?
        row
      end
    end

    # Strict extraction for round-b suggestions. Accepted roots:
    # - { "suggestions": [ ... ] }
    # - { "output": { "suggestions": [ ... ] } } (single legacy wrapper)
    # - [ { ...suggestion... }, ... ]
    def extract_suggestions_list_from_parsed(parsed)
      case parsed
      when Array
        parsed.select { |x| x.is_a?(Hash) }
      when Hash
        direct = parsed['suggestions'] || parsed[:suggestions]
        return direct if direct.is_a?(Array)

        wrapped = parsed['output'] || parsed[:output]
        if wrapped.is_a?(Hash)
          nested = wrapped['suggestions'] || wrapped[:suggestions]
          return nested if nested.is_a?(Array)
        end

        if parsed['type'].present? || parsed[:type].present?
          return [parsed]
        end

        Rails.logger.warn("[StudyAssistant] round_b JSON had no suggestions array; keys=#{parsed.keys.inspect}")
        []
      else
        Rails.logger.warn("[StudyAssistant] round_b unexpected parsed type #{parsed.class}")
        []
      end
    end

    def normalize_suggestion_type_token(raw)
      raw.to_s.strip.downcase.tr('-', '_').gsub(/\s+/, '_')
    end

    def normalize_suggestion_type(raw)
      t = normalize_suggestion_type_token(raw)
      SUGGESTION_TYPES.include?(t) ? t : nil
    end

    def normalize_suggestions(list)
      return [] unless list.is_a?(Array)

      out = []
      list.each do |item|
        break if out.length >= MAX_SUGGESTIONS

        next unless item.is_a?(Hash)

        h = item.stringify_keys
        type = normalize_suggestion_type(h['type'])
        next if type.nil?

        payload = h['payload']
        payload = payload.is_a?(Hash) ? payload.stringify_keys : {}
        payload = enrich_add_verse_payload(payload) if type == 'add_verse'
        payload = normalize_add_task_payload(payload) if type == 'add_task'
        next if type == 'add_task' && payload.nil?

        out << {
          'order' => out.length,
          'id' => h['id'].presence || SecureRandom.uuid,
          'type' => type,
          'title' => h['title'].to_s.truncate(200),
          'summary' => h['summary'].to_s.truncate(2000),
          'payload' => payload,
          'duration' => normalize_duration(h['duration'] || payload['duration'])
        }
      end

      Rails.logger.info("[StudyAssistant] truncated suggestions from #{list.length} to #{MAX_SUGGESTIONS}") if list.length > MAX_SUGGESTIONS

      out
    end

    def normalize_add_task_payload(payload)
      p = payload.stringify_keys
      normalized_type = normalize_suggestion_type_token(p['task_type'])
      return nil unless StudyTask::TASK_TYPES.include?(normalized_type)
      p['task_type'] = normalized_type

      normalized_status = normalize_suggestion_type_token(p['status'])
      return nil if p['status'].present? && !StudyTask::STATUSES.include?(normalized_status)
      p['status'] = normalized_status if normalized_status.present?
      p
    end

    def study_verse_snapshot_hash(sv)
      {
        'uuid' => sv.uuid,
        'verse_uuid' => sv.verse_uuid,
        'bible_uuid' => sv.bible_uuid,
        'book_uuid' => sv.book_uuid,
        'chapter' => sv.chapter,
        'ordinal' => sv.ordinal,
        'note' => sv.note,
        'verse_text' => (sv.verse&.text).presence || sv.verse_text
      }
    end

    def normalize_target_duration_param(raw)
      return nil if raw.nil?

      n = Integer(raw, exception: false)
      n = raw.to_i if n.nil?
      return nil unless n.is_a?(Integer) && n.positive?

      n
    end

    def enrich_add_verse_payload(payload)
      p = payload.stringify_keys
      vu = p['verse_uuid'].to_s.strip.presence
      v = vu ? Verse.includes(:bible, :book).find_by(id: vu) : nil
      if v.nil? && p['bible_uuid'].present? && p['book_uuid'].present?
        bible = Bible.find_by(id: p['bible_uuid'])
        # Scope book to this Bible — book UUIDs must not be resolved globally across translations.
        book = bible&.books&.find_by(id: p['book_uuid'])
        if bible && book
          ch = p['chapter'].to_i
          ord = p['ordinal'].to_i
          v = Verse.find_by(bible: bible, book: book, chapter: ch, ordinal: ord) if ch.positive? && ord.positive?
        end
      end
      return p unless v

      p.merge(
        'verse_uuid' => v.uuid,
        'bible_uuid' => v.bible.uuid,
        'book_uuid' => v.book.uuid,
        'chapter' => v.chapter,
        'ordinal' => v.ordinal
      )
    end

    def apply_target_duration_scaling!(suggestions)
      target = @target_duration_minutes
      return if target.nil? || target <= 0
      return if suggestions.blank?

      n = suggestions.size
      durations = suggestions.map { |s| (s['duration'] || 0).to_i }
      sum = durations.sum

      if sum <= 0
        base = target / n
        rem = target % n
        suggestions.each_with_index do |s, i|
          s['duration'] = base + (i < rem ? 1 : 0)
        end
        return
      end

      return if sum == target

      exact_parts = durations.map { |d| d * target / sum.to_f }
      floors = exact_parts.map(&:floor)
      remainder = target - floors.sum
      fracs = exact_parts.each_with_index.map { |x, i| [i, x - x.floor] }.sort_by { |_, f| -f }
      remainder.times { |k| floors[fracs[k][0]] += 1 }
      suggestions.each_with_index { |s, i| s['duration'] = floors[i] }
    end

    def build_debug_payload(searches:, search_result:, selected_refs:)
      {
        searches_requested: searches,
        search_errors: search_result[:errors],
        verses_returned: search_result[:verses].size,
        reference_bibles: selected_refs
      }
    end

    def normalize_duration(raw)
      return nil if raw.nil?

      value = Integer(raw, exception: false)
      return nil if value.nil? || value.negative?

      value
    end
  end
end
