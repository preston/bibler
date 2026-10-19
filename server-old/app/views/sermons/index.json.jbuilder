# frozen_string_literal: true

json.sermons @sermons do |sermon|
  json.partial! 'sermons/sermon', sermon: sermon, viewer: @viewer
end
json.meta @meta if @meta.present?
