json.extract! study_task, :uuid, :instruction, :task_type, :status, :assignee_label, :due_at, :context, :position, :created_at, :updated_at
json.paths do
  json.self study_study_task_path(study_task.study.uuid, study_task.uuid, format: :json)
end
