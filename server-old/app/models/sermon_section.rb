# frozen_string_literal: true

# Author: Preston Lee
class SermonSection < ApplicationRecord
  include UuidPrimaryKeyAsUuid

  belongs_to :sermon
  has_many :sermon_section_verses, -> { order(:position, :id) }, dependent: :destroy, inverse_of: :sermon_section

  validates :position, numericality: { only_integer: true, greater_than_or_equal_to: 0 }
end
