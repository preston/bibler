# frozen_string_literal: true

require 'test_helper'

# Author: Preston Lee
class StudiesApiTest < ActionDispatch::IntegrationTest
  setup do
    @study = studies(:one)
    @question = study_questions(:one)
    @task = study_tasks(:one)
    @auth_one = { 'Authorization' => "Bearer #{users(:one).api_token}" }
    @auth_two = { 'Authorization' => "Bearer #{users(:two).api_token}" }
  end

  test 'creates and fetches a study by uuid' do
    post '/studies.json', params: {
      study: {
        title: 'New Study',
        goal: 'Goal',
        visibility: 'private'
      }
    }, headers: @auth_one

    assert_response :created
    created_uuid = JSON.parse(response.body).dig('study', 'uuid')
    assert_not_nil created_uuid

    get "/studies/#{created_uuid}.json", headers: @auth_one
    assert_response :success
    body = JSON.parse(response.body)
    assert_equal 'New Study', body.dig('study', 'title')
  end

  test 'serializes RBAC capabilities for study owner' do
    get "/studies/#{@study.uuid}.json", headers: @auth_one
    assert_response :success
    body = JSON.parse(response.body)
    assert_equal true, body.dig('study', 'capabilities', 'can_edit_structure')
    assert_equal true, body.dig('study', 'capabilities', 'can_reorder_content')
    assert_equal true, body.dig('study', 'capabilities', 'can_delete_study')
    assert_includes body.dig('study', 'available_study_modes'), 'leader'
  end

  test 'co-leader cannot delete entire study via capabilities' do
    get "/studies/#{@study.uuid}.json", headers: @auth_two
    assert_response :success
    body = JSON.parse(response.body)
    assert_equal false, body.dig('study', 'capabilities', 'can_delete_study')
    assert_includes body.dig('study', 'available_study_modes'), 'co-leader'
  end

  test 'co-leader cannot destroy study' do
    delete "/studies/#{@study.uuid}.json", headers: @auth_two
    assert_response :forbidden
  end

  test 'supports nested questions, answers, and tasks' do
    post "/studies/#{@study.uuid}/questions.json", params: {
      study_question: {
        prompt: 'What does this verse command?',
        question_type: 'discussion'
      }
    }, headers: @auth_one
    assert_response :created
    question_uuid = JSON.parse(response.body).dig('question', 'uuid')

    post "/studies/#{@study.uuid}/questions/#{question_uuid}/answers.json", params: {
      study_answer: {
        response: 'It calls us to obedience.',
        visibility: 'study',
        author_label: 'Participant'
      }
    }, headers: @auth_one
    assert_response :created

    post "/studies/#{@study.uuid}/tasks.json", params: {
      study_task: {
        instruction: 'Read the chapter and report one insight.',
        task_type: 'reading',
        status: 'open'
      }
    }, headers: @auth_one
    assert_response :created
  end

  test 'reorders questions and tasks by uuid sequence' do
    q2 = StudyQuestion.create!(study: @study, prompt: 'Second prompt', question_type: 'discussion', position: 1)
    post "/studies/#{@study.uuid}/questions/reorder.json",
         params: { ordered_uuids: [q2.uuid, @question.uuid] },
         headers: @auth_one
    assert_response :success
    assert_equal [q2.uuid, @question.uuid], @study.study_questions.ordered.pluck(:uuid).first(2)

    t2 = StudyTask.create!(study: @study, instruction: 'Second task', task_type: 'reading', status: 'open', position: 1)
    post "/studies/#{@study.uuid}/tasks/reorder.json",
         params: { ordered_uuids: [t2.uuid, @task.uuid] },
         headers: @auth_one
    assert_response :success
    assert_equal [t2.uuid, @task.uuid], @study.study_tasks.ordered.pluck(:uuid).first(2)
  end

  test 'supports study plan items CRUD and reorder' do
    post "/studies/#{@study.uuid}/plan_items.json", params: {
      study_plan_item: {
        title: 'Opening',
        item_type: 'custom',
        notes: 'Welcome everyone',
        anchor: 'intro'
      }
    }, headers: @auth_one
    assert_response :created
    item_uuid = JSON.parse(response.body).dig('plan_item', 'uuid')
    assert_equal 5, JSON.parse(response.body).dig('plan_item', 'duration')

    get "/studies/#{@study.uuid}/plan_items.json", headers: @auth_one
    assert_response :success
    assert_includes JSON.parse(response.body).fetch('plan_items').map { |i| i['uuid'] }, item_uuid

    patch "/studies/#{@study.uuid}/plan_items/#{item_uuid}.json", params: {
      study_plan_item: { title: 'Opening Prayer' }
    }, headers: @auth_one
    assert_response :success

    post "/studies/#{@study.uuid}/plan_items/reorder.json",
         params: { ordered_uuids: [item_uuid] },
         headers: @auth_one
    assert_response :success
  end

  test 'accepts duration on plan items and serializes zero as unspecified' do
    post "/studies/#{@study.uuid}/plan_items.json", params: {
      study_plan_item: {
        title: 'Timed',
        item_type: 'task',
        notes: '',
        duration: 12
      }
    }, headers: @auth_one
    assert_response :created
    item_uuid = JSON.parse(response.body).dig('plan_item', 'uuid')
    assert_equal 12, JSON.parse(response.body).dig('plan_item', 'duration')

    patch "/studies/#{@study.uuid}/plan_items/#{item_uuid}.json", params: {
      study_plan_item: { duration: 0 }
    }, headers: @auth_one
    assert_response :success
    assert_nil JSON.parse(response.body).dig('plan_item', 'duration')
  end

  test 'accepts create as a task type' do
    post "/studies/#{@study.uuid}/tasks.json", params: {
      study_task: {
        instruction: 'Create something tangible',
        task_type: 'create',
        status: 'open'
      }
    }, headers: @auth_one
    assert_response :created
    assert_equal 'create', JSON.parse(response.body).dig('task', 'task_type')
  end

  test 'plan item user state persists per authenticated user' do
    post "/studies/#{@study.uuid}/plan_items.json", params: {
      study_plan_item: { title: 'State step', item_type: 'custom', notes: '' }
    }, headers: @auth_one
    assert_response :created
    item_uuid = JSON.parse(response.body).dig('plan_item', 'uuid')

    patch "/studies/#{@study.uuid}/plan_items/#{item_uuid}/state.json",
          params: { status: 'revisit' },
          headers: @auth_one
    assert_response :success
    assert_equal 'revisit', JSON.parse(response.body).dig('plan_item', 'my_status')

    get "/studies/#{@study.uuid}/plan_items.json", headers: @auth_one
    assert_response :success
    row = JSON.parse(response.body).fetch('plan_items').find { |i| i['uuid'] == item_uuid }
    assert_equal 'revisit', row['my_status']
  end

  test 'plan item state requires authentication' do
    study = studies(:two)
    post "/studies/#{study.uuid}/plan_items.json", params: {
      study_plan_item: { title: 'Auth step', item_type: 'custom', notes: '' }
    }, headers: @auth_one
    item_uuid = JSON.parse(response.body).dig('plan_item', 'uuid')

    patch "/studies/#{study.uuid}/plan_items/#{item_uuid}/state.json", params: { status: 'complete' }
    assert_response :unauthorized
  end

  test 'routes still resolve existing verse lookup endpoint' do
    verse = Verse.first
    get "/#{verse.bible.uuid}/#{verse.book.uuid}/#{verse.chapter}/#{verse.ordinal}.json"
    assert_response :success
  end

  test 'supports studies index sorting and pagination metadata' do
    get '/studies.json', params: { q: 'Study', sort: 'title', direction: 'asc', page: 1, per_page: 1 }
    assert_response :success
    body = JSON.parse(response.body)
    assert body['meta'].present?
    assert_equal 1, body.dig('meta', 'page')
    assert_equal 1, body.dig('meta', 'per_page')
    assert_equal 'title', body.dig('meta', 'sort')
    assert_equal 'asc', body.dig('meta', 'direction')
    assert_equal 1, body.fetch('studies').length
  end

  test 'includes total_duration_minutes in studies index and excludes zero durations' do
    study = studies(:one)
    StudyPlanItem.create!(study: study, title: 'A', item_type: 'verse', notes: '', position: 900, duration: 3)
    StudyPlanItem.create!(study: study, title: 'B', item_type: 'task', notes: '', position: 901, duration: 0)

    get '/studies.json', params: { scope: 'owned' }, headers: @auth_one
    assert_response :success
    row = JSON.parse(response.body).fetch('studies').find { |s| s['uuid'] == study.uuid }
    assert_not_nil row
    assert_equal 3, row['total_duration_minutes']
  end

  test 'ignores deprecated study metadata payload on update' do
    patch "/studies/#{@study.uuid}.json", params: {
      study: { metadata: { selected_bible_uuids: ['x'], keep_me: 'yes' }, title: 'Metadata Ignored' }
    }, headers: @auth_one
    assert_response :success

    @study.reload
    assert_equal 'Metadata Ignored', @study.title
  end

  test 'owner can destroy study' do
    delete "/studies/#{@study.uuid}.json", headers: @auth_one
    assert_response :no_content
  end
end
