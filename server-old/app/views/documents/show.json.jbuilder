# frozen_string_literal: true

json.document do
  json.extract! @document, :uuid, :original_filename, :extracted_text, :created_at, :updated_at
  json.paths do
    json.self document_path(@document.uuid, format: :json)
  end
end
