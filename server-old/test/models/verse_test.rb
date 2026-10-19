# frozen_string_literal: true

require 'test_helper'

# Author: Preston Lee
class VerseTest < ActiveSupport::TestCase
  test 'requires book and bible to match' do
    verse = Verse.new(
      bible: bibles(:test1),
      book: books(:genesis_test2),
      chapter: 1,
      ordinal: 99,
      text: 'Integrity check'
    )

    assert_not verse.valid?
    assert_includes verse.errors[:book], 'must belong to the same bible as the verse'
  end
end
