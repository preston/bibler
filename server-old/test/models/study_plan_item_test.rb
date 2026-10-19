require "test_helper"

class StudyPlanItemTest < ActiveSupport::TestCase
  test 'defaults duration by item type on create' do
    study = studies(:one)

    verse = StudyPlanItem.create!(study: study, title: 'Verse', item_type: 'verse', notes: '', position: 99)
    question = StudyPlanItem.create!(study: study, title: 'Question', item_type: 'question', notes: '', position: 100)
    commentary = StudyPlanItem.create!(study: study, title: 'Commentary', item_type: 'commentary', notes: '', position: 101)
    task = StudyPlanItem.create!(study: study, title: 'Task', item_type: 'task', notes: '', position: 102)
    custom = StudyPlanItem.create!(study: study, title: 'Custom', item_type: 'custom', notes: '', position: 103)

    assert_equal 2, verse.duration
    assert_equal 7, question.duration
    assert_equal 5, commentary.duration
    assert_equal 5, task.duration
    assert_equal 5, custom.duration
  end

  test 'allows nil duration and rejects invalid duration values' do
    base = StudyPlanItem.new(study: studies(:one), title: 'x', item_type: 'custom', notes: '', position: 99)
    base.duration = nil
    assert base.valid?

    base.duration = 2
    assert base.valid?

    base.duration = -1
    assert_not base.valid?
    assert_includes base.errors[:duration], 'must be greater than or equal to 0'

    base.duration = 1.25
    assert_not base.valid?
  end

  test 'effective_duration treats zero as unspecified' do
    item = study_plan_items(:one)
    assert_nil item.effective_duration

    item.duration = 4
    assert_equal 4, item.effective_duration
  end

  test 'resource reference must match item_type when provided' do
    item = StudyPlanItem.new(
      study: studies(:one),
      title: 'Verse reference',
      item_type: 'verse',
      notes: '',
      position: 50,
      resource_type: 'study_task',
      resource_uuid: SecureRandom.uuid
    )
    assert_not item.valid?
    assert_includes item.errors[:resource_type], 'must be study_verse for item_type=verse'
  end
end
