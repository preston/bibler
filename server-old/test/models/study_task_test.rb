require "test_helper"

class StudyTaskTest < ActiveSupport::TestCase
  test 'allows create as task_type' do
    task = StudyTask.new(
      study: studies(:one),
      instruction: 'Create something',
      task_type: 'create',
      status: 'open',
      position: 0
    )

    assert task.valid?
  end
end
