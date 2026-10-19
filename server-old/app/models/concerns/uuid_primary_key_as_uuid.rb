# frozen_string_literal: true

# Maps legacy `uuid` attribute name to the UUID primary key (`id`) for JSON/API compatibility.
module UuidPrimaryKeyAsUuid
  extend ActiveSupport::Concern

  included do
    alias_attribute :uuid, :id
  end
end
