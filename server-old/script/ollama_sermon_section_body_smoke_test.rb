#!/usr/bin/env ruby
# frozen_string_literal: true

# Manual smoke test: one plaintext section-body call (same path as default outline_pass).
# Usage (from bibler-server root):
#   BIBLER_SERVER_OLLAMA_URL=http://127.0.0.1:11434 \
#   OLLAMA_TEST_MODEL=qwen3.5:9b \
#   ruby script/ollama_sermon_section_body_smoke_test.rb

require_relative '../config/environment'

url = Ollama::Client.base_url
abort('Set BIBLER_SERVER_OLLAMA_URL to your Ollama base (e.g. http://127.0.0.1:11434)') if url.blank?

# Default model must exist locally (`ollama list`); override if yours differs.
model = ENV['OLLAMA_TEST_MODEL'].presence || Ollama::Client::DEFAULT_MODEL
chat = Ollama::ChatService.new
em = Integer(ENV.fetch('OLLAMA_TEST_SECTION_MINUTES', '15'))

section_payload = {
  section_uuid: '00000000-0000-0000-0000-000000000001',
  title: 'Faith and works',
  estimated_minutes: em,
  verses: [
    {
      verse_uuid: 'v1',
      bible_uuid: 'b1',
      book_uuid: 'bk',
      chapter: 2,
      ordinal: 14,
      text: 'What good is it, my brothers, if someone says he has faith but does not have works? Can that faith save him?'
    }
  ]
}

predict = Ollama::SermonAssistantOrchestrator.allocate.send(:compute_section_body_num_predict, em)
opts = Ollama::InferenceOptions.merge(num_predict: predict)

puts "Ollama URL: #{url}"
puts "Model: #{model}"
puts "Section minutes: #{em}, num_predict: #{predict}, options: #{opts.inspect}"
puts 'Calling plaintext section body (no JSON mode)...'

resp = chat.chat_with_system(
  system_message: Ollama::Prompts::SermonAssistant.section_body_plaintext_system_prompt,
  user_content: Ollama::Prompts::SermonAssistant.section_body_plaintext_user_content(
    section_payload: section_payload,
    user_message: 'Preach on faith and works from James for a mixed adult congregation.',
    sermon: { uuid: 's1', title: 'Test', visibility: 'private', target_duration_minutes: 30 },
    library_excerpts: [],
    sermon_target_minutes: 30
  ),
  model: model,
  ollama_format: nil,
  ollama_options: opts
)

if Ollama::ChatService.response_error?(resp)
  warn "ERROR: #{resp[:error] || resp['error']}"
  exit 1
end

body = resp[:output].to_s
puts "Output characters: #{body.length}"
min_expected = em * Integer(ENV.fetch('BIBLER_SERMON_PROMPT_MIN_CHARS_PER_MINUTE', '900'))
puts "Prompt asked for at least ~#{min_expected} characters."
puts "---- first 400 chars ----"
puts body[0, 400]
puts '---- last 200 chars ----'
puts(body.length > 200 ? body[-200, 200] : body)
