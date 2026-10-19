# frozen_string_literal: true

json.sermon_section do
  json.partial! 'sermon_sections/sermon_section', sermon_section: @sermon_section, sermon: @sermon
end
