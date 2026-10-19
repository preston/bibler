json.commentaries @study_commentaries do |study_commentary|
  json.partial! 'study_commentaries/study_commentary', study_commentary: study_commentary
end
