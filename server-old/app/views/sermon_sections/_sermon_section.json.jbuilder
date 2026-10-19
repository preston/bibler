# frozen_string_literal: true

json.extract! sermon_section, :uuid, :title, :body, :position, :estimated_minutes, :created_at, :updated_at
json.paths do
  json.self sermon_section_path(sermon.uuid, sermon_section.uuid, format: :json)
  json.verses sermon_section_verses_path(sermon.uuid, sermon_section.uuid, format: :json)
end
