# frozen_string_literal: true

require 'test_helper'

class BibleStudySearchServiceTest < ActiveSupport::TestCase
  test 'returns structured verses for bible uuid and text' do
    bible = bibles(:test1)
    result = BibleStudySearchService.call(searches: [
      { bible_uuid: bible.uuid, text: 'Lorem', limit: 5 }
    ])

    assert_empty result[:errors]
    assert_operator result[:verses].size, :>, 0
    row = result[:verses].first
    assert_equal bible.uuid, row[:bible_uuid]
    assert row[:verse_uuid].present?
    assert row[:text].present?
  end

  test 'records error for unknown bible' do
    result = BibleStudySearchService.call(searches: [
      { bible_uuid: 'no-such-bible', text: 'x', limit: 5 }
    ])

    assert_operator result[:errors].size, :>, 0
    assert_empty result[:verses]
  end

  test 'deduplicates verses when the same row is matched by repeated searches' do
    bible = bibles(:test1)
    result = BibleStudySearchService.call(searches: [
      { bible_uuid: bible.uuid, text: 'Lorem', limit: 5 },
      { bible_uuid: bible.uuid, text: 'Lorem', limit: 5 }
    ])

    uuids = result[:verses].map { |r| r[:verse_uuid] }
    assert_equal uuids.uniq.size, uuids.size
  end
end
