json.extract! study_verse, :uuid, :verse_uuid, :bible_uuid, :book_uuid, :chapter, :ordinal, :note, :position, :created_at, :updated_at
json.verse_text((study_verse.verse&.text).presence || study_verse.verse_text)
json.paths do
  json.study study_path(study_verse.study.uuid, format: :json)
end
