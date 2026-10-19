# frozen_string_literal: true

require 'test_helper'

class SystemSettingsControllerTest < ActionDispatch::IntegrationTest
  setup do
    @role = Role.find_or_create_by!(name: 'Fixture Bible Role') do |r|
      r.bibles = true
      r.is_default = false
    end
    @user = users(:one)
    @user.roles << @role unless @user.roles.include?(@role)
    @headers = { 'Authorization' => "Bearer #{@user.api_token}" }
  end

  test 'denies ai defaults management without permission' do
    get '/system/settings/ai_defaults'
    assert_response :forbidden
  end

  test 'returns and updates ai defaults with bibles permission' do
    get '/system/settings/ai_defaults', headers: @headers, params: { q: 'test', sort: 'name', direction: 'asc', page: 1, per_page: 1 }
    assert_response :success
    payload = JSON.parse(response.body)
    assert payload['meta'].present?
    assert_equal 1, payload.dig('meta', 'per_page')
    bibles = payload.fetch('bibles')
    refute_empty bibles

    uuid = bibles.first.fetch('uuid')
    patch '/system/settings/ai_defaults', params: {
      defaults: [{ uuid: uuid, ai_default_english: true }]
    }, headers: @headers
    assert_response :success
    assert_equal true, JSON.parse(response.body).fetch('bibles').find { |b| b['uuid'] == uuid }['ai_default_english']
  end
end
