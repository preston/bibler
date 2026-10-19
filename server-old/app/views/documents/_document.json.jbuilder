# frozen_string_literal: true

json.extract! document, :uuid, :original_filename, :created_at, :updated_at
json.extracted_text_preview document.extracted_text.to_s.truncate(500)
json.paths do
  json.self document_path(document.uuid, format: :json)
end
