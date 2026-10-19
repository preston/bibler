# frozen_string_literal: true

require 'json'

module Ollama
  module Prompts
    # JSON context size limits and recursive truncation for LLM payloads.
    module Context
      DEFAULT_MAX_CONTEXT_CHARS = 128_000
      DEFAULT_MAX_ARRAY_ITEMS = 25
      DEFAULT_MAX_STRING_CHARS = 600

      # Comparator loads full chapters from the DB; default limits must not drop verses or slice JSON mid-chapter.
      DEFAULT_COMPARATOR_MAX_ARRAY_ITEMS = 256
      DEFAULT_COMPARATOR_MAX_STRING_CHARS = 16_384
      DEFAULT_COMPARATOR_MAX_CONTEXT_CHARS = 524_288

      module_function

      # Optional +max_array_items+ and +max_string_chars+ override env defaults (used for comparator vs generic chat).
      def normalize(value, max_array_items: nil, max_string_chars: nil)
        ma = max_array_items.nil? ? self.max_array_items : max_array_items
        ms = max_string_chars.nil? ? self.max_string_chars : max_string_chars

        case value
        when Hash
          value.each_with_object({}) do |(key, nested), acc|
            acc[key] = normalize(nested, max_array_items: ma, max_string_chars: ms)
          end
        when Array
          limited = value.first(ma).map { |item| normalize(item, max_array_items: ma, max_string_chars: ms) }
          limited << { _truncated_items: value.length - ma } if value.length > ma
          limited
        when String
          value.length > ms ? "#{value[0...ms]}... [truncated]" : value
        else
          value
        end
      end

      def max_context_chars
        Integer(ENV.fetch('BIBLER_SERVER_OLLAMA_MAX_CONTEXT_CHARS', DEFAULT_MAX_CONTEXT_CHARS))
      rescue ArgumentError
        DEFAULT_MAX_CONTEXT_CHARS
      end

      def comparator_max_context_chars
        Integer(ENV.fetch('BIBLER_SERVER_OLLAMA_COMPARATOR_MAX_CONTEXT_CHARS', DEFAULT_COMPARATOR_MAX_CONTEXT_CHARS))
      rescue ArgumentError
        DEFAULT_COMPARATOR_MAX_CONTEXT_CHARS
      end

      def max_array_items
        Integer(ENV.fetch('BIBLER_SERVER_OLLAMA_MAX_ARRAY_ITEMS', DEFAULT_MAX_ARRAY_ITEMS))
      rescue ArgumentError
        DEFAULT_MAX_ARRAY_ITEMS
      end

      def comparator_max_array_items
        Integer(ENV.fetch('BIBLER_SERVER_OLLAMA_COMPARATOR_MAX_ARRAY_ITEMS', DEFAULT_COMPARATOR_MAX_ARRAY_ITEMS))
      rescue ArgumentError
        DEFAULT_COMPARATOR_MAX_ARRAY_ITEMS
      end

      def max_string_chars
        Integer(ENV.fetch('BIBLER_SERVER_OLLAMA_MAX_STRING_CHARS', DEFAULT_MAX_STRING_CHARS))
      rescue ArgumentError
        DEFAULT_MAX_STRING_CHARS
      end

      def comparator_max_string_chars
        Integer(ENV.fetch('BIBLER_SERVER_OLLAMA_COMPARATOR_MAX_STRING_CHARS', DEFAULT_COMPARATOR_MAX_STRING_CHARS))
      rescue ArgumentError
        DEFAULT_COMPARATOR_MAX_STRING_CHARS
      end
    end
  end
end
