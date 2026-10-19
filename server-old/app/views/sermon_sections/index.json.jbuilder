# frozen_string_literal: true

json.sermon_sections @sermon_sections do |section|
  json.partial! 'sermon_sections/sermon_section', sermon_section: section, sermon: @sermon
  json.sermon_section_verses section.sermon_section_verses.ordered.includes(:verse) do |sv|
    json.partial! 'sermon_section_verses/sermon_section_verse', sermon_section_verse: sv, sermon: @sermon, sermon_section: section
  end
end
