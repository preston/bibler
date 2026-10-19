# frozen_string_literal: true

# Author: Preston Lee
# Text extracted client-side from an uploaded document; original binary is not stored.
class Document < ApplicationRecord
  include UuidPrimaryKeyAsUuid

  belongs_to :user

  validates :original_filename, presence: true
  validates :extracted_text, presence: true
end
