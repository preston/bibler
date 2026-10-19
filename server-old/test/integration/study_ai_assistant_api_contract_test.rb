# frozen_string_literal: true

require 'test_helper'

# Verifies POST /studies/:study_uuid/ai/assistant returns `suggestions` in the shape Bibler UI expects
# (see bibler-ui StudyAssistantSuggestion + normalizeAssistantSuggestions).
#
# First example from Study AI Assistant Test Cases.md (Mary / 1-hour lesson).
class StudyAiAssistantApiContractTest < ActionDispatch::IntegrationTest
  # First bullet from bibler-ui "Study AI Assistant Test Cases.md" (Bible Study Group Planning)
  MARIAN_LESSON_USE_CASE =
    'Create a 1-hour lesson covering the role and life of Jesus\' mother, Mary, and notably events in her life ' \
    'as covered by the New Testament. Add a 5 minute break in the middle. I\'d like a 15 minute discussion at ' \
    'the end centering on key challenges Mary may have faced, and what she could do in her faith to overcome them.'.freeze

  ALLOWED_TYPES = %w[add_verse add_commentary add_question add_task].freeze

  class FakeChat
    def initialize(round_outputs)
      @outputs = round_outputs
    end

    def chat_with_system(system_message:, user_content:, model: nil, **)
      { output: @outputs.shift }
    end

    def chat_with_system_stream(**)
      raise 'streaming not used when stream: false'
    end
  end

  setup do
    @study = studies(:one)
    @auth = { 'Authorization' => "Bearer #{users(:one).api_token}" }
    @bible = bibles(:test1)
    @book_uuid = books(:genesis_test1).uuid
  end

  test 'orchestrator returns suggestions matching UI contract for Marian lesson use case' do
    round_a = { searches: [{ bible_uuid: @bible.uuid, text: 'Lorem', limit: 8 }] }.to_json
    verse = verses(:verse1_test1)
    round_b = {
      suggestions: [
        {
          id: 'mary-plan-1',
          type: 'add_task',
          title: 'Open with Mary in Scripture',
          summary: 'Briefly introduce Mary’s place in the Gospels using passages already in the database results.',
          order: 0,
          duration: 10,
          payload: {
            instruction: 'Read aloud and note two observations about Mary from the verses shown.',
            task_type: 'reading'
          }
        },
        {
          id: 'mary-plan-2',
          type: 'add_verse',
          title: 'Anchor verse',
          summary: 'Keep discussion tied to this text.',
          order: 1,
          payload: {
            bible_uuid: @bible.uuid,
            book_uuid: @book_uuid,
            chapter: verse.chapter,
            ordinal: verse.ordinal,
            verse_text: verse.text,
            note: ''
          }
        }
      ]
    }.to_json

    orch = Ollama::StudyAssistantOrchestrator.new(
      study: @study,
      user_message: MARIAN_LESSON_USE_CASE,
      model: nil,
      stream: false,
      chat_service: FakeChat.new([round_a, round_b])
    )
    result = orch.call

    assert_nil result[:error], result.inspect
    assert_suggestions_ui_contract result[:suggestions]
  end

  test 'POST ai/assistant JSON returns suggestions array in UI shape for Marian lesson use case' do
    payload = {
      suggestions: [
        {
          'id' => 'api-test-1',
          'type' => 'add_question',
          'title' => 'Mary’s faith under pressure',
          'summary' => 'Use this discussion after reviewing verses about Mary in the search results.',
          'order' => 0,
          'duration' => 15,
          'payload' => {
            'prompt' => 'What challenges did Mary face, and how does Scripture show her response?',
            'question_type' => 'discussion',
            'guidance_notes' => 'Stay grounded in verses returned by the assistant search.'
          }
        }
      ],
      debug: { searches_requested: [], verses_returned: 0, reference_bibles: [] }
    }

    original_new = Ollama::StudyAssistantOrchestrator.method(:new)
    Ollama::StudyAssistantOrchestrator.singleton_class.define_method(:new) do |**_kwargs|
      fake = Object.new
      fake.define_singleton_method(:call) { payload }
      fake
    end

    begin
      post "/studies/#{@study.uuid}/ai/assistant",
           params: { message: MARIAN_LESSON_USE_CASE, stream: false },
           headers: @auth,
           as: :json
      assert_equal 200, response.status, -> { "body=#{response.body.inspect[0..800]}" }
      body = JSON.parse(response.body)
      assert_suggestions_ui_contract body['suggestions']
    ensure
      Ollama::StudyAssistantOrchestrator.singleton_class.define_method(:new, original_new)
    end
  end

  private

  def assert_suggestions_ui_contract(suggestions)
    assert_kind_of Array, suggestions, 'suggestions must be an array for the UI list'
    assert suggestions.any?, 'suggestions must be non-empty for a successful assistant run'

    suggestions.each_with_index do |s, idx|
      assert_kind_of Hash, s
      id = s['id'] || s[:id]
      assert id.present?, "suggestion[#{idx}] must have id (string)"

      type = s['type'] || s[:type]
      assert_includes ALLOWED_TYPES, type.to_s, "suggestion[#{idx}] type must be a known UI type"

      title = s['title'] || s[:title]
      assert title.is_a?(String), "suggestion[#{idx}] must have string title"

      summary = s['summary'] || s[:summary]
      assert summary.is_a?(String), "suggestion[#{idx}] must have string summary (plan step notes)"

      payload = s['payload'] || s[:payload]
      assert payload.is_a?(Hash), "suggestion[#{idx}] payload must be an object for applySuggestion()"

      if s.key?('order') || s.key?(:order)
        ord = s['order'] || s[:order]
        assert ord.nil? || ord.is_a?(Integer) || (ord.is_a?(String) && ord.match?(/\A\d+\z/)),
               "suggestion[#{idx}] order must be numeric if present"
      end

      next unless s.key?('duration') || s.key?(:duration)

      dur = s['duration'] || s[:duration]
      assert dur.nil? || dur.is_a?(Integer) || (dur.is_a?(String) && dur.match?(/\A\d+\z/)),
             "suggestion[#{idx}] duration must be integer minutes if present"
    end
  end
end
