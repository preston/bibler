# frozen_string_literal: true

json.documents @documents do |f|
  json.partial! 'documents/document', document: f
end
