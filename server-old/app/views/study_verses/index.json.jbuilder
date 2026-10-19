json.verses @study_verses do |study_verse|
  json.partial! 'study_verses/study_verse', study_verse: study_verse
end
