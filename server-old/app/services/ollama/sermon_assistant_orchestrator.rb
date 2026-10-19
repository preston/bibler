# frozen_string_literal: true

module Ollama
  # Two-phase sermon AI: (1) Bible DB search + section shells with verses, (2) outline/body text.
  class SermonAssistantOrchestrator
    MAX_SEARCH_ITEMS = 20

    def initialize(sermon:, user_message:, model: nil, chat_service: nil, document_uuids: [], replace_sections: true,
                    outline_target_duration_minutes: nil, verse_target_duration_minutes: nil)
      @sermon = sermon
      @user_message = user_message.to_s.strip
      @model = model
      @chat = chat_service || ChatService.new
      @document_uuids = Array(document_uuids).map(&:to_s).reject(&:blank?)
      @replace_sections = ActiveModel::Type::Boolean.new.cast(replace_sections)
      @outline_target_duration_minutes = outline_target_duration_minutes
      @verse_target_duration_minutes = verse_target_duration_minutes
    end

    # Returns { sections: [...], search_summary: ..., debug: ... } or { error: ... }
    def verse_pass
      return { error: 'User message is blank.' } if @user_message.blank?

      library_excerpts = load_library_excerpts

      helper = StudyAssistantOrchestrator.new(
        study: minimal_study_proxy,
        user_message: @user_message,
        model: @model,
        chat_service: @chat,
        stream: false
      )

      # Reuse private search pipeline via reflection (same Bible DB rules as study assistant).
      snapshot = build_sermon_snapshot_for_search(library_excerpts: library_excerpts)
      selected_refs = helper.send(:selected_reference_bibles)
      catalog = helper.send(:build_ai_prompt_bible_rows, selected_refs)
      round_a = Prompts::StudyAssistant.round_a_user_content(
        user_message: @user_message,
        snapshot: snapshot,
        catalog: catalog,
        selected_refs: selected_refs,
        max_search_items: MAX_SEARCH_ITEMS
      )
      system_search = Prompts::StudyAssistant.search_system_prompt
      a_resp = helper.send(:run_llm_round, system: system_search, user_content: round_a, round: 'a')
      return a_resp if ChatService.response_error?(a_resp)

      plan = ResponseJson.parse_object(a_resp[:output].to_s) || {}
      searches = helper.send(:normalize_searches, plan['searches'] || plan[:searches])
      searches = helper.send(:constrain_searches_to_reference_bibles, searches, selected_refs)
      search_result = BibleStudySearchService.call(searches: searches)
      if search_result[:verses].blank?
        searches = helper.send(:fallback_lexical_searches, primary_bible_uuid: helper.send(:primary_search_bible_uuid, selected_refs))
        searches = helper.send(:constrain_searches_to_reference_bibles, searches, selected_refs)
        search_result = BibleStudySearchService.call(searches: searches)
      end

      verses = search_result[:verses]
      return { error: 'No verses found in database for this request.' } if verses.blank?

      verse_target = verse_duration_target_minutes

      group_resp = @chat.chat_with_system(
        system_message: Prompts::SermonAssistant.section_group_system_prompt,
        user_content: Prompts::SermonAssistant.section_group_user_content(
          user_message: @user_message,
          database_verses: verses,
          library_excerpts: library_excerpts,
          target_duration_minutes: verse_target
        ),
        model: @model,
        ollama_format: 'json',
        ollama_options: { num_predict: compute_section_group_num_predict(verses) }
      )
      return group_resp if ChatService.response_error?(group_resp)

      parsed = ResponseJson.parse_object(group_resp[:output].to_s) || {}
      sections_in = parsed['sections'] || parsed[:sections]
      return { error: 'Could not parse section groups from model output.' } unless sections_in.is_a?(Array)

      allowed = verses.to_h { |v| [v[:verse_uuid].to_s, v] }
      built = []
      sections_in.each do |raw|
        next unless raw.is_a?(Hash)

        title = raw['title'].to_s.strip.presence || 'Section'
        uuids = Array(raw['verse_uuids'] || raw[:verse_uuids]).map(&:to_s)
        rows = []
        uuids.each do |uid|
          v = allowed[uid]
          rows << v if v
        end
        em = coerce_outline_minutes_int(raw['estimated_minutes'] || raw[:estimated_minutes])
        built << { 'title' => title, 'verses' => rows, 'estimated_minutes' => em }
      end

      return { error: 'Model produced no valid sections from database verses.' } if built.empty?

      normalize_outline_sections_estimated_minutes!(built, target_minutes: verse_target)

      persisted = nil
      ActiveRecord::Base.transaction do
        if @replace_sections
          @sermon.sermon_sections.destroy_all
        end
        pos = 0
        persisted = built.map do |sec|
          minutes = sec['estimated_minutes'].to_i
          minutes = 1 if minutes <= 0
          s = @sermon.sermon_sections.create!(
            title: sec['title'],
            body: '',
            position: pos,
            estimated_minutes: minutes
          )
          pos += 1
          vpos = 0
          sec['verses'].each do |v|
            s.sermon_section_verses.create!(
              bible_uuid: v[:bible_uuid],
              book_uuid: v[:book_uuid],
              chapter: v[:chapter],
              ordinal: v[:ordinal],
              verse_uuid: v[:verse_uuid],
              verse_text: v[:text],
              position: vpos
            )
            vpos += 1
          end
          s.reload
        end
      end

      {
        sections: persisted.map { |s| SermonSectionSerializer.hash(s) },
        search_summary: {
          verse_count: verses.size,
          errors: Array(search_result[:errors]).map(&:to_s)
        },
        debug: { searches: searches }
      }
    end

    # Returns { sections: [...] } for client to merge or { error: ... }
    def outline_pass
      return { error: 'User message is blank.' } if @user_message.blank?

      library_excerpts = load_library_excerpts
      sections_payload = @sermon.sermon_sections.includes(sermon_section_verses: :verse).order(:position, :id).map do |sec|
        {
          section_uuid: sec.uuid,
          title: sec.title,
          body: sec.body,
          estimated_minutes: sec.estimated_minutes,
          verses: sec.sermon_section_verses.ordered.map do |sv|
            {
              verse_uuid: sv.verse_uuid,
              bible_uuid: sv.bible_uuid,
              book_uuid: sv.book_uuid,
              chapter: sv.chapter,
              ordinal: sv.ordinal,
              text: (sv.verse&.text).presence || sv.verse_text
            }
          end
        }
      end

      return { error: 'Add at least one sermon section with verses before running outline.' } if sections_payload.empty?

      has_any_verse = sections_payload.any? { |s| Array(s[:verses]).present? }
      return { error: 'Add verses to at least one section before running outline.' } unless has_any_verse

      effective_target = outline_duration_target_minutes

      if outline_single_call_json?
        outline_pass_legacy_single_json(sections_payload, library_excerpts, effective_target)
      else
        outline_pass_per_section_plaintext(sections_payload, library_excerpts, effective_target)
      end
    end

    private

    def outline_single_call_json?
      ActiveModel::Type::Boolean.new.cast(ENV.fetch('BIBLER_SERMON_OUTLINE_SINGLE_CALL_JSON', 'false'))
    end

    # One giant JSON response. Ollama `format: json` often truncates long string fields; prefer plaintext per-section (default).
    def outline_pass_legacy_single_json(sections_payload, library_excerpts, effective_target)
      outline_resp = @chat.chat_with_system(
        system_message: Prompts::SermonAssistant.outline_system_prompt,
        user_content: Prompts::SermonAssistant.outline_user_content(
          user_message: @user_message,
          sermon: @sermon.slice(:uuid, :title, :visibility, :target_duration_minutes),
          sections_payload: sections_payload,
          library_excerpts: library_excerpts,
          target_duration_minutes: effective_target
        ),
        model: @model,
        ollama_format: 'json',
        ollama_options: { num_predict: compute_outline_num_predict(sections_payload, effective_target) }
      )
      return outline_resp if ChatService.response_error?(outline_resp)

      parsed = ResponseJson.parse_object(outline_resp[:output].to_s) || {}
      out_sections = parsed['sections'] || parsed[:sections]
      return { error: 'Could not parse outline from model output.' } unless out_sections.is_a?(Array)

      normalize_outline_sections_estimated_minutes!(out_sections, target_minutes: effective_target)

      { sections: out_sections }
    end

    # One LLM call per section, plaintext body (no JSON API mode) so long prose is not cut off by constrained JSON decoding.
    def outline_pass_per_section_plaintext(sections_payload, library_excerpts, effective_target)
      sermon_slice = @sermon.slice(:uuid, :title, :visibility, :target_duration_minutes)
      out_sections = []

      sections_payload.each_with_index do |sp, idx|
        em = (sp[:estimated_minutes] || sp['estimated_minutes']).to_i
        em = 1 if em < 1
        predict = compute_section_body_num_predict(em)
        Rails.logger.info("[SermonAssistant] outline section #{idx + 1}/#{sections_payload.size} est_min=#{em} num_predict=#{predict}")

        resp = @chat.chat_with_system(
          system_message: Prompts::SermonAssistant.section_body_plaintext_system_prompt,
          user_content: Prompts::SermonAssistant.section_body_plaintext_user_content(
            section_payload: sp,
            user_message: @user_message,
            sermon: sermon_slice,
            library_excerpts: library_excerpts,
            sermon_target_minutes: effective_target
          ),
          model: @model,
          ollama_format: nil,
          ollama_options: { num_predict: predict }
        )
        return resp if ChatService.response_error?(resp)

        body = strip_optional_markdown_fences(resp[:output].to_s)
        uuid = (sp[:section_uuid] || sp['section_uuid']).to_s
        verse_uuids = Array(sp[:verses] || sp['verses']).filter_map { |v| (v[:verse_uuid] || v['verse_uuid']).presence&.to_s }

        out_sections << {
          'section_uuid' => uuid,
          'title' => (sp[:title] || sp['title']).to_s,
          'body' => body,
          'estimated_minutes' => em,
          'verse_uuids' => verse_uuids
        }
      end

      normalize_outline_sections_estimated_minutes!(out_sections, target_minutes: effective_target)

      { sections: out_sections }
    end

    def strip_optional_markdown_fences(s)
      t = s.to_s.strip
      t = t.sub(/\A```\w*\s*\n?/, '').sub(/\n?```\s*\z/, '').strip
      t
    end

    # Prefer explicit request target (matches client toolbar) over persisted sermon when provided.
    def outline_duration_target_minutes
      req = @outline_target_duration_minutes&.to_i
      return req if req&.positive?

      t = @sermon.target_duration_minutes&.to_i
      t&.positive? ? t : nil
    end

    def verse_duration_target_minutes
      req = @verse_target_duration_minutes&.to_i
      return req if req&.positive?

      t = @sermon.target_duration_minutes&.to_i
      t&.positive? ? t : nil
    end

    # Allow long JSON: scale max tokens with planned sermon length so bodies are not cut off mid-generation.
    # Budgets are ~10x the original defaults so outline bodies can reach full spoken length; cap is overridable via ENV.
    def compute_outline_num_predict(sections_payload, effective_target)
      sum = sections_payload.sum { |s| (s[:estimated_minutes] || s['estimated_minutes']).to_i }
      sum = effective_target.to_i if sum <= 0 && effective_target&.to_i&.positive?
      sum = [sum, 5].max
      per_min = Integer(ENV.fetch('BIBLER_SERMON_OUTLINE_NUM_PREDICT_PER_MINUTE', '2200'))
      base = Integer(ENV.fetch('BIBLER_SERMON_OUTLINE_NUM_PREDICT_BASE', '60000'))
      floor = Integer(ENV.fetch('BIBLER_SERMON_OUTLINE_NUM_PREDICT_FLOOR', '102400'))
      cap = Integer(ENV.fetch('BIBLER_SERMON_OUTLINE_NUM_PREDICT_MAX', '327680'))
      # ~2.2k tokens/minute of prose in JSON (10x prior 220/min) for full paragraphs per minute.
      [[sum * per_min + base, floor].max, cap].min
    end

    # Verse pass: section-group JSON scales with verse count; default budget ~10x prior implicit limits.
    def compute_section_group_num_predict(verses)
      n = verses.size
      per_verse = Integer(ENV.fetch('BIBLER_SERMON_SECTION_GROUP_NUM_PREDICT_PER_VERSE', '500'))
      base = Integer(ENV.fetch('BIBLER_SERMON_SECTION_GROUP_NUM_PREDICT_BASE', '20000'))
      floor = Integer(ENV.fetch('BIBLER_SERMON_SECTION_GROUP_NUM_PREDICT_FLOOR', '102400'))
      cap = Integer(ENV.fetch('BIBLER_SERMON_SECTION_GROUP_NUM_PREDICT_MAX', '327680'))
      [[n * per_verse + base, floor].max, cap].min
    end

    # Per-section plaintext outline: token budget for ONE section's body (no JSON grammar overhead).
    def compute_section_body_num_predict(estimated_minutes)
      em = [estimated_minutes.to_i, 1].max
      per_min = Integer(ENV.fetch('BIBLER_SERMON_SECTION_BODY_NUM_PREDICT_PER_MINUTE', '2200'))
      base = Integer(ENV.fetch('BIBLER_SERMON_SECTION_BODY_NUM_PREDICT_BASE', '8192'))
      floor = Integer(ENV.fetch('BIBLER_SERMON_SECTION_BODY_NUM_PREDICT_FLOOR', '16384'))
      cap = Integer(ENV.fetch('BIBLER_SERMON_SECTION_BODY_NUM_PREDICT_MAX', '131072'))
      [[em * per_min + base, floor].max, cap].min
    end

    # Ensures integer minutes per section; when target is set, sum matches target (or equal-split if model returned zeros).
    def normalize_outline_sections_estimated_minutes!(sections, target_minutes: nil)
      return if sections.blank?

      tgt = target_minutes&.to_i
      tgt = nil unless tgt&.positive?

      rows = sections.select { |s| s.is_a?(Hash) }
      return if rows.empty?

      rows.each do |r|
        r['estimated_minutes'] = coerce_outline_minutes_int(r['estimated_minutes'] || r[:estimated_minutes])
      end

      sum = rows.sum { |r| r['estimated_minutes'].to_i }

      if tgt
        if sum.zero?
          distribute_equal_section_minutes!(rows, tgt)
        elsif sum != tgt
          redistribute_section_minutes_to_target!(rows, tgt, sum)
        end
      elsif sum.zero?
        # No sermon target: ensure a usable default total so the client can show per-section times.
        distribute_equal_section_minutes!(rows, [5 * rows.size, 15].max)
      end
    end

    def coerce_outline_minutes_int(raw)
      v = case raw
          when nil then 0
          when Numeric then raw.round
          else raw.to_s.to_i
          end
      v.negative? ? 0 : v
    end

    def distribute_equal_section_minutes!(rows, total)
      n = rows.size
      return if n.zero?

      base, rem = total.divmod(n)
      rows.each_with_index do |r, i|
        r['estimated_minutes'] = base + (i < rem ? 1 : 0)
      end
    end

    def redistribute_section_minutes_to_target!(rows, target, current_sum)
      n = rows.size
      return if n.zero? || current_sum <= 0

      floats = rows.map { |r| r['estimated_minutes'].to_i * target.to_f / current_sum }
      floors = floats.map(&:floor)
      diff = target - floors.sum
      remainders = floats.each_with_index.map { |f, i| [f - f.floor, i] }
      remainders.sort_by! { |frac, _| -frac }
      floors.each_with_index { |f, i| rows[i]['estimated_minutes'] = f }
      diff.times { |k| rows[remainders[k % n][1]]['estimated_minutes'] += 1 }
    end

    def minimal_study_proxy
      Study.new(
        title: @sermon.title,
        goal: 'Sermon',
        visibility: @sermon.visibility,
        owner_id: @sermon.user_id
      )
    end

    def build_sermon_snapshot_for_search(library_excerpts: [])
      {
        study: {
          uuid: @sermon.uuid,
          title: @sermon.title,
          goal: 'Sermon preparation',
          visibility: @sermon.visibility,
          plan_total_duration_minutes: 0
        },
        library_file_excerpts: Array(library_excerpts),
        verses: [],
        commentaries: [],
        questions: [],
        tasks: []
      }
    end

    def load_library_excerpts
      return [] if @document_uuids.empty?

      Document.where(user_id: @sermon.user_id, id: @document_uuids).map do |f|
        { uuid: f.uuid, filename: f.original_filename, text: f.extracted_text.to_s.truncate(240_000) }
      end
    end

    # Minimal JSON shape for verse_pass response (avoid extra jbuilder dependency in service).
    class SermonSectionSerializer
      def self.hash(section)
        {
          uuid: section.uuid,
          title: section.title,
          body: section.body,
          position: section.position,
          estimated_minutes: section.estimated_minutes,
          sermon_section_verses: section.sermon_section_verses.ordered.map do |sv|
            {
              uuid: sv.uuid,
              verse_uuid: sv.verse_uuid,
              bible_uuid: sv.bible_uuid,
              book_uuid: sv.book_uuid,
              chapter: sv.chapter,
              ordinal: sv.ordinal,
              position: sv.position,
              verse_text: (sv.verse&.text).presence || sv.verse_text
            }
          end
        }
      end
    end
  end
end
