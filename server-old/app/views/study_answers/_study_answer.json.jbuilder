json.extract! study_answer, :uuid, :response, :author_label, :visibility, :created_at, :updated_at
json.study_commentary_uuid study_answer.study_commentary&.uuid
json.user_id study_answer.user_id
json.username study_answer.user&.username
