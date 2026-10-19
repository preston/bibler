# frozen_string_literal: true

require 'test_helper'

module Ollama
  class ResponseJsonTest < ActiveSupport::TestCase
    test 'parses raw json object' do
      obj = ResponseJson.parse_object('{"searches":[]}')
      assert_equal [], obj['searches']
    end

    test 'parses fenced json' do
      obj = ResponseJson.parse_object(<<~TXT)
        ```json
        {"foo":1}
        ```
      TXT
      assert_equal 1, obj['foo']
    end
  end
end
