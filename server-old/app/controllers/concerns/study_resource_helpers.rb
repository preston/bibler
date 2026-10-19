# frozen_string_literal: true

module StudyResourceHelpers
  private

  def next_position_for(scope)
    (scope.maximum(:position) || -1) + 1
  end

  def find_study_resource!(scope, key:, error_message:)
    record = scope.find_by(id: key)
    return record if record

    render json: { error: error_message }, status: :not_found
    nil
  end
end
