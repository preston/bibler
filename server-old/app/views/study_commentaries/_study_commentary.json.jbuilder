json.extract! study_commentary, :uuid, :source_type, :title, :body, :prompt, :context, :position, :created_at, :updated_at
json.paths do
  json.self study_study_commentary_path(study_commentary.study.uuid, study_commentary.uuid, format: :json)
  json.study study_path(study_commentary.study.uuid, format: :json)
end
