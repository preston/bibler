# frozen_string_literal: true

require 'test_helper'

module Ollama
  class SermonAssistantOrchestratorTest < ActiveSupport::TestCase
    setup do
      @orch = SermonAssistantOrchestrator.allocate
    end

    test 'redistributes estimated_minutes proportionally to match target' do
      sections = [
        { 'section_uuid' => 'a', 'estimated_minutes' => 5 },
        { 'section_uuid' => 'b', 'estimated_minutes' => 5 }
      ]
      @orch.send(:normalize_outline_sections_estimated_minutes!, sections, target_minutes: 30)
      assert_equal 15, sections[0]['estimated_minutes']
      assert_equal 15, sections[1]['estimated_minutes']
      assert_equal 30, sections.sum { |s| s['estimated_minutes'] }
    end

    test 'equal-splits when model returned zeros but sermon target is set' do
      sections = [
        { 'section_uuid' => 'a', 'estimated_minutes' => 0 },
        { 'section_uuid' => 'b', 'estimated_minutes' => 0 },
        { 'section_uuid' => 'c', 'estimated_minutes' => 0 }
      ]
      @orch.send(:normalize_outline_sections_estimated_minutes!, sections, target_minutes: 10)
      assert_equal 10, sections.sum { |s| s['estimated_minutes'] }
      assert_equal [3, 3, 4], sections.map { |s| s['estimated_minutes'] }.sort
    end

    test 'when no target and all zeros, applies default total so UI can show minutes' do
      sections = [
        { 'section_uuid' => 'a', 'estimated_minutes' => 0 },
        { 'section_uuid' => 'b', 'estimated_minutes' => 0 }
      ]
      @orch.send(:normalize_outline_sections_estimated_minutes!, sections, target_minutes: nil)
      assert_equal 15, sections.sum { |s| s['estimated_minutes'] }
      assert_equal [7, 8], sections.map { |s| s['estimated_minutes'] }.sort
    end

    test 'compute_section_body_num_predict scales with section minutes' do
      a = @orch.send(:compute_section_body_num_predict, 15)
      b = @orch.send(:compute_section_body_num_predict, 5)
      assert_operator a, :>, b
    end

    test 'verse_pass built rows normalize like outline rows (title and verses preserved)' do
      built = [
        { 'title' => 'A', 'verses' => [], 'estimated_minutes' => 2 },
        { 'title' => 'B', 'verses' => [], 'estimated_minutes' => 2 }
      ]
      @orch.send(:normalize_outline_sections_estimated_minutes!, built, target_minutes: 20)
      assert_equal 'A', built[0]['title']
      assert_equal 10, built[0]['estimated_minutes']
      assert_equal 10, built[1]['estimated_minutes']
    end
  end
end
