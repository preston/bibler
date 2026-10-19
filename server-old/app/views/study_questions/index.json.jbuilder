json.questions @study_questions do |study_question|
  json.partial! 'study_questions/study_question', study_question: study_question
end
