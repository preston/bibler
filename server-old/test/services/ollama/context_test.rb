# frozen_string_literal: true

require 'test_helper'

class Ollama::Prompts::ContextTest < ActiveSupport::TestCase
  test 'normalize uses default array cap of 25' do
    arr = (1..30).to_a
    out = Ollama::Prompts::Context.normalize(arr)
    assert_equal 26, out.length
    assert_equal({ _truncated_items: 5 }, out.last)
  end

  test 'normalize respects explicit higher array cap for comparator-style payloads' do
    arr = (1..40).to_a
    out = Ollama::Prompts::Context.normalize(arr, max_array_items: 256)
    assert_equal 40, out.length
    refute out.last.is_a?(Hash) && out.last.key?(:_truncated_items)
  end
end
