json.extract! study_question, :uuid, :prompt, :question_type, :guidance_notes, :verse_anchor, :position, :created_at, :updated_at
json.paths do
  json.self study_study_question_path(study_question.study.uuid, study_question.uuid, format: :json)
  json.answers study_study_question_study_answers_path(study_question.study.uuid, study_question.uuid, format: :json)
end
