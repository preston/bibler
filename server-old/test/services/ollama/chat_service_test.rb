# frozen_string_literal: true

require 'test_helper'

module Ollama
  class ChatServiceTest < ActiveSupport::TestCase
    class FakeClient
      def initialize(response)
        @response = response
      end

      def chat(**)
        @response
      end
    end

    test 'chat_with_system with parse_json_output returns structured output and raw message content' do
      ollama_body = {
        'model' => 'm',
        'message' => {
          'role' => 'assistant',
          'content' => '{"verses":[{"ordinal":1,"commentary":"note"}]}'
        }
      }
      svc = ChatService.new(client: FakeClient.new(ollama_body))
      r = svc.chat_with_system(system_message: 's', user_content: 'u', parse_json_output: true)
      assert_equal 'm', r[:model]
      assert_equal [{ 'ordinal' => 1, 'commentary' => 'note' }], r[:output]['verses']
      assert_equal r[:output], r[:raw]['message']['content']
      assert_equal true, r[:structured_output]
    end

    test 'chat_with_system with parse_json_output keeps prose as output when not json' do
      prose = "I'm sorry, I cannot help with that."
      ollama_body = {
        'model' => 'm',
        'message' => { 'role' => 'assistant', 'content' => prose }
      }
      svc = ChatService.new(client: FakeClient.new(ollama_body))
      r = svc.chat_with_system(system_message: 's', user_content: 'u', parse_json_output: true)
      assert_nil r[:error]
      assert_equal prose, r[:output]
      assert_equal prose, r[:raw]['message']['content']
      assert_equal false, r[:structured_output]
    end
  end
end
