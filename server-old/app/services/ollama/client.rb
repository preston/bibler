# frozen_string_literal: true

require 'net/http'
require 'json'

module Ollama
  class Client
    # Default when +model+ is omitted (e.g. /ai/chat, /ai/comparator_commentary). Swap tag to use another local model.
    # DEFAULT_MODEL = 'robzilla/bibleai:bf16' # 128K context, 15GB
    DEFAULT_MODEL = 'bigwest60/bible-scholar:latest' # 128K context, 4.9GB
    # DEFAULT_MODEL = 'robzilla/gemmabible:latest' # 128K context, 5.8GB

    DEFAULT_OPEN_TIMEOUT_SECONDS = 2
    DEFAULT_READ_TIMEOUT_SECONDS = 180
    DEFAULT_WRITE_TIMEOUT_SECONDS = 30
    DEFAULT_RETRIES = 1

    def self.base_url
      ENV['BIBLER_SERVER_OLLAMA_URL'].to_s.strip
    end

    def self.configured?
      base_url.present?
    end

    # Optional +format+ is Ollama structured output: "json" or a JSON Schema object (see Ollama API "format").
    # Optional +options+ is passed through (e.g. +{ temperature: 0.2 }+).
    def chat(model:, messages:, format: nil, options: nil)
      return unconfigured_error unless self.class.configured?

      payload = {
        model: model.presence || DEFAULT_MODEL,
        messages: messages,
        stream: false
      }
      payload[:format] = format if format.present?
      payload[:options] = options if options.present?

      request_json('/api/chat', method: :post, payload: payload)
    end

    # Yields each parsed JSON object from Ollama's NDJSON stream. Returns final merged hash or error hash.
    # Optional +format+ matches non-streaming chat (e.g. "json" for structured Round-A output).
    def chat_stream(model:, messages:, format: nil, &block)
      return unconfigured_error unless self.class.configured?

      payload = {
        model: model.presence || DEFAULT_MODEL,
        messages: messages,
        stream: true
      }
      payload[:format] = format if format.present?

      request_chat_stream('/api/chat', payload: payload, &block)
    end

    private

    def unconfigured_error
      { error: 'BIBLER_SERVER_OLLAMA_URL is not configured.' }
    end

    def open_timeout_seconds
      Integer(ENV.fetch('BIBLER_SERVER_OLLAMA_OPEN_TIMEOUT', DEFAULT_OPEN_TIMEOUT_SECONDS))
    rescue ArgumentError
      DEFAULT_OPEN_TIMEOUT_SECONDS
    end

    def read_timeout_seconds
      Integer(ENV.fetch('BIBLER_SERVER_OLLAMA_READ_TIMEOUT', DEFAULT_READ_TIMEOUT_SECONDS))
    rescue ArgumentError
      DEFAULT_READ_TIMEOUT_SECONDS
    end

    def write_timeout_seconds
      Integer(ENV.fetch('BIBLER_SERVER_OLLAMA_WRITE_TIMEOUT', DEFAULT_WRITE_TIMEOUT_SECONDS))
    rescue ArgumentError
      DEFAULT_WRITE_TIMEOUT_SECONDS
    end

    def retry_count
      Integer(ENV.fetch('BIBLER_SERVER_OLLAMA_RETRIES', DEFAULT_RETRIES))
    rescue ArgumentError
      DEFAULT_RETRIES
    end

    DEFAULT_STREAM_READ_TIMEOUT_SECONDS = 600

    def stream_read_timeout_seconds
      Integer(ENV.fetch('BIBLER_SERVER_OLLAMA_STREAM_READ_TIMEOUT', DEFAULT_STREAM_READ_TIMEOUT_SECONDS))
    rescue ArgumentError
      DEFAULT_STREAM_READ_TIMEOUT_SECONDS
    end

    def request_chat_stream(path, payload:)
      url = URI.join(self.class.base_url, path)
      http = Net::HTTP.new(url.host, url.port)
      http.use_ssl = (url.scheme == 'https')
      http.open_timeout = open_timeout_seconds
      http.read_timeout = stream_read_timeout_seconds
      http.write_timeout = write_timeout_seconds if http.respond_to?(:write_timeout=)

      request = Net::HTTP::Post.new(url)
      request['Content-Type'] = 'application/json'
      request.body = payload.to_json

      started_at = Process.clock_gettime(Process::CLOCK_MONOTONIC)
      last_obj = nil
      accumulated_content = +''
      http.request(request) do |response|
        code = response.code.to_i
        unless code.between?(200, 299)
          body = +''
          response.read_body { |f| body << f }
          log_request(
            path: path,
            method: :post,
            payload: payload,
            status: code,
            started_at: started_at,
            attempts: 1
          )
          json = if body.present?
                   begin
                     JSON.parse(body)
                   rescue StandardError
                     {}
                   end
                 else
                   {}
                 end
          return { error: "Ollama request failed with status #{response.code}.", details: json }
        end

        buffer = +''
        response.read_body do |fragment|
          buffer << fragment
          buffer = drain_json_lines(buffer) do |obj|
            last_obj = obj
            err = obj['error']
            return { error: err.to_s } if err.present?

            delta = obj.dig('message', 'content').to_s
            accumulated_content << delta if delta.present?
            yield obj if block_given?
          end
        end

        buffer = drain_json_lines(buffer) do |obj|
          last_obj = obj
          err = obj['error']
          return { error: err.to_s } if err.present?

          delta = obj.dig('message', 'content').to_s
          accumulated_content << delta if delta.present?
          yield obj if block_given?
        end

        if buffer.strip.present?
          obj = JSON.parse(buffer.strip)
          last_obj = obj
          return { error: obj['error'].to_s } if obj['error'].present?

          delta = obj.dig('message', 'content').to_s
          accumulated_content << delta if delta.present?
          yield obj if block_given?
        end
      end

      log_request(
        path: path,
        method: :post,
        payload: payload,
        status: 200,
        started_at: started_at,
        attempts: 1
      )

      model_name = last_obj&.dig('model') || payload[:model]
      {
        'model' => model_name,
        'message' => { 'content' => accumulated_content },
        'raw_last' => last_obj
      }
    rescue Net::ReadTimeout, Net::OpenTimeout
      log_request(
        path: path,
        method: :post,
        payload: payload,
        status: 'timeout',
        started_at: started_at,
        attempts: 1
      )
      {
        error: "Ollama stream timed out after #{stream_read_timeout_seconds}s (open timeout #{open_timeout_seconds}s).",
        hint: 'Increase BIBLER_SERVER_OLLAMA_STREAM_READ_TIMEOUT or simplify the prompt/context payload.'
      }
    rescue JSON::ParserError => e
      {
        error: "Ollama stream parse error: #{e.message}"
      }
    rescue StandardError => e
      log_request(
        path: path,
        method: :post,
        payload: payload,
        status: 'error',
        started_at: started_at,
        attempts: 1,
        error: e.message
      )
      { error: "Ollama stream failed: #{e.message}" }
    end

    def drain_json_lines(buffer)
      loop do
        idx = buffer.index("\n")
        break unless idx

        line = buffer.slice!(0..idx).strip
        next if line.empty?

        obj = JSON.parse(line)
        yield obj
      end
      buffer
    end

    def request_json(path, method:, payload: nil)
      url = URI.join(self.class.base_url, path)
      http = Net::HTTP.new(url.host, url.port)
      http.use_ssl = (url.scheme == 'https')
      http.open_timeout = open_timeout_seconds
      http.read_timeout = read_timeout_seconds
      http.write_timeout = write_timeout_seconds if http.respond_to?(:write_timeout=)

      request = method == :post ? Net::HTTP::Post.new(url) : Net::HTTP::Get.new(url)
      request['Content-Type'] = 'application/json'
      request.body = payload.to_json if payload

      attempts = 0
      started_at = Process.clock_gettime(Process::CLOCK_MONOTONIC)
      response = begin
        http.request(request)
      rescue Net::ReadTimeout, Net::OpenTimeout => e
        attempts += 1
        retry if attempts <= retry_count
        raise e
      end

      body = response.body.to_s
      json = body.present? ? JSON.parse(body) : {}
      log_request(
        path: path,
        method: method,
        payload: payload,
        status: response.code.to_i,
        started_at: started_at,
        attempts: attempts + 1
      )
      return json if response.code.to_i.between?(200, 299)

      { error: "Ollama request failed with status #{response.code}.", details: json }
    rescue Net::ReadTimeout, Net::OpenTimeout
      log_request(
        path: path,
        method: method,
        payload: payload,
        status: 'timeout',
        started_at: started_at,
        attempts: attempts + 1
      )
      {
        error: "Ollama request timed out after #{read_timeout_seconds}s (open timeout #{open_timeout_seconds}s).",
        hint: 'Increase BIBLER_SERVER_OLLAMA_READ_TIMEOUT or simplify the prompt/context payload.'
      }
    rescue StandardError => e
      log_request(
        path: path,
        method: method,
        payload: payload,
        status: 'error',
        started_at: started_at,
        attempts: attempts + 1,
        error: e.message
      )
      { error: "Ollama request failed: #{e.message}" }
    end

    def log_request(path:, method:, payload:, status:, started_at:, attempts:, error: nil)
      elapsed_ms = ((Process.clock_gettime(Process::CLOCK_MONOTONIC) - started_at) * 1000).round
      model = payload.is_a?(Hash) ? payload[:model] : nil
      payload_bytes = payload.nil? ? 0 : payload.to_json.bytesize
      Rails.logger.info(
        "[Ollama] method=#{method.to_s.upcase} path=#{path} status=#{status} model=#{model || 'n/a'} " \
        "payload_bytes=#{payload_bytes} elapsed_ms=#{elapsed_ms} attempts=#{attempts}" \
        "#{error ? " error=#{error}" : ''}"
      )
    rescue StandardError
      # Never fail request processing due to logging issues.
      nil
    end
  end
end
