# frozen_string_literal: true

json.array!(@books) do |b|
  json.extract! b, :id, :uuid, :name, :ordinal, :created_at, :updated_at
  json.bible do
    json.id b.bible.id
    json.uuid b.bible.uuid
    json.name b.bible.name
    json.abbreviation b.bible.abbreviation
    json.path bible_path(b.bible.uuid, format: :json)
  end
  json.testament b.read_attribute(:testament)
end
