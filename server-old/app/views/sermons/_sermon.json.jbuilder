# frozen_string_literal: true

json.extract! sermon, :uuid, :title, :visibility, :target_duration_minutes, :created_at, :updated_at
viewer = local_assigns[:viewer]
if sermon.owner
  json.owner do
    json.id sermon.owner.id
    json.username sermon.owner.username
    json.name sermon.owner.name
  end
end
json.paths do
  json.self sermon_path(sermon.uuid, format: :json)
  json.sections sermon_sections_path(sermon.uuid, format: :json)
end
