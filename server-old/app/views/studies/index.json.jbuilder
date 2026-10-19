json.studies @studies do |study|
  json.partial! 'studies/study', study: study, viewer: @viewer, total_duration_minutes: @study_total_duration_by_id[study.id]
end
json.meta @meta if @meta.present?
