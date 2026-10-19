# frozen_string_literal: true

# Author: Preston Lee
# A saved scripture reference (bible/book/chapter/ordinal) attached to a study.
class StudyVerse < ApplicationRecord
  include UuidPrimaryKeyAsUuid

  belongs_to :study
  belongs_to :verse, optional: true, primary_key: :id, foreign_key: :verse_uuid, inverse_of: false

  before_validation :apply_reference_from_verse_uuid, if: -> { verse_uuid.present? }

  validates :bible_uuid, :book_uuid, presence: true
  validates :chapter, :ordinal, presence: true, numericality: { only_integer: true, greater_than: 0 }
  validates :position, numericality: { only_integer: true, greater_than_or_equal_to: 0 }
  scope :ordered, -> { order(:position, :id) }

  private

  def apply_reference_from_verse_uuid
    v = Verse.includes(:bible, :book).find_by(id: verse_uuid.to_s.strip)
    unless v
      errors.add(:verse_uuid, 'does not match a known verse')
      return
    end

    self.bible_uuid = v.bible.uuid
    self.book_uuid = v.book.uuid
    self.chapter = v.chapter
    self.ordinal = v.ordinal
    self.verse_text = nil
  end
end
