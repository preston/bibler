# frozen_string_literal: true

json.extract! sermon_section_verse, :uuid, :verse_uuid, :bible_uuid, :book_uuid, :chapter, :ordinal, :position, :created_at, :updated_at
json.verse_text((sermon_section_verse.verse&.text).presence || sermon_section_verse.verse_text)
json.paths do
  json.self sermon_section_verse_path(sermon.uuid, sermon_section.uuid, sermon_section_verse.uuid, format: :json)
end

