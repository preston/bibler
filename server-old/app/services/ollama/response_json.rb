# frozen_string_literal: true

module Ollama
  module ResponseJson
    def self.parse_object(text)
      return nil if text.blank?

      stripped = text.to_s.strip
      if stripped.include?('```')
        stripped = stripped.sub(/\A```(?:json)?\s*/mi, '')
        stripped = stripped.sub(/\s*```\z/m, '')
        stripped = stripped.strip
      end

      begin
        parsed = JSON.parse(stripped)
        # Some models double-encode JSON (outer value is a JSON string containing an object/array).
        if parsed.is_a?(String)
          inner = parsed.strip
          return parse_object(inner) if inner.start_with?('{', '[')
        end
        return parsed
      rescue JSON::ParserError
        i = stripped.index('{')
        j = stripped.rindex('}')
        return nil if i.nil? || j.nil? || j <= i

        begin
          return JSON.parse(stripped[i..j])
        rescue JSON::ParserError
          return nil
        end
      end
    end
  end
end
