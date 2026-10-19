# frozen_string_literal: true

# Author: Preston Lee
class Verse < ApplicationRecord
  include UuidPrimaryKeyAsUuid
  include PgSearch::Model
  # multisearchable :against => [:text]
  # prefix: partial-word match; any_word: OR multi-token queries (better recall for study assistant & verse search)
  pg_search_scope :search_by_text,
                  against: :text,
                  using: {
                    tsearch: {
                      prefix: true,
                      any_word: true
                    }
                  }

  belongs_to	:bible
  belongs_to	:book

  validates_presence_of :bible
  validates_presence_of :book

  validates_numericality_of :chapter, only_integer: true, greater_than: 0
  validates_numericality_of :ordinal, only_integer: true, greater_than: 0

  validates_uniqueness_of :ordinal, scope: %i[bible book chapter]
  validate :book_belongs_to_same_bible

  private

  def book_belongs_to_same_bible
    return if bible.blank? || book.blank?
    return if book.bible_id == bible_id

    errors.add(:book, 'must belong to the same bible as the verse')
  end
end
