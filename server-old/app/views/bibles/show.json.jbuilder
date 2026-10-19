# frozen_string_literal: true

json.extract! @bible, :id, :uuid, :name, :abbreviation, :language, :license, :created_at, :updated_at,
              :ai_default_english, :ai_default_hebrew_ot, :ai_default_greek, :ai_default_aramaic

# Optionally include books if requested
if params[:include]&.split(',')&.include?('books')
  json.books @bible.books.merge(Book.ordered_for_display) do |book|
    json.extract! book, :id, :uuid, :name, :ordinal, :created_at, :updated_at
    json.testament book.read_attribute(:testament)
  end
end
