json.answers @study_answers do |study_answer|
  json.partial! 'study_answers/study_answer', study_answer: study_answer
end
