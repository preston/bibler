# frozen_string_literal: true

json.sermon_section_verse do
  json.partial! 'sermon_section_verses/sermon_section_verse',
                sermon_section_verse: @sermon_section_verse,
                sermon: @sermon,
                sermon_section: @sermon_section
end
