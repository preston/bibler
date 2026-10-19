# frozen_string_literal: true

# Author: Preston Lee
class Book < ApplicationRecord
  include UuidPrimaryKeyAsUuid

  has_many :verses, dependent: :destroy
  belongs_to :bible

  # prefix: avoids defining Book.new / Book.old as enum scopes (breaks ActiveRecord::Base.new)
  enum :testament, { old: 'old', new: 'new', other: 'other' }, prefix: :testament

  after_save :warn_if_testament_other_persisted

  validates_presence_of :name
  validates_uniqueness_of :name, scope: :bible_id

  scope :ordered_for_display, lambda {
    order(
      Arel.sql("CASE testament WHEN 'old' THEN 0 WHEN 'new' THEN 1 ELSE 2 END"),
      :ordinal
    )
  }

  scope :ordered_with_bible, lambda {
    order(
      :bible_id,
      Arel.sql("CASE testament WHEN 'old' THEN 0 WHEN 'new' THEN 1 ELSE 2 END"),
      :ordinal
    )
  }

  def verse_count(bible, chapter = 0)
    return verses.where(bible:).count if chapter.zero?

    verses.where(bible:, chapter:).count
  end

  private

  def warn_if_testament_other_persisted
    return unless testament_other?
    return unless saved_change_to_testament? || saved_change_to_id?

    abbr = bible&.abbreviation || 'unknown'
    reason = Bibler::Data.other_testament_reason_for_book_name(name)
    Rails.logger.warn(
      "[Book] testament=other reason=#{reason} bible=#{abbr} book=#{name.inspect} uuid=#{uuid}"
    )
  end
end
