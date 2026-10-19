# frozen_string_literal: true

json.array!(@bibles) do |b|
  json.extract! b, :id, :uuid, :name, :abbreviation, :language, :license, :created_at, :updated_at,
                :ai_default_english, :ai_default_hebrew_ot, :ai_default_greek, :ai_default_aramaic
end
