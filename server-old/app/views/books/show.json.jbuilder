# frozen_string_literal: true

json.extract! @book, :id, :uuid, :name, :ordinal, :created_at, :updated_at
json.bible do
  json.id @book.bible.id
  json.uuid @book.bible.uuid
  json.name @book.bible.name
  json.abbreviation @book.bible.abbreviation
  json.path bible_path(@book.bible.uuid, format: :json)
end
json.testament @book.read_attribute(:testament)
