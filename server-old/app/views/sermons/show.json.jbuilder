# frozen_string_literal: true

json.sermon do
  json.partial! 'sermons/sermon', sermon: @sermon, viewer: @viewer
end
