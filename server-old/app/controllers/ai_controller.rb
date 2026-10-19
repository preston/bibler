# frozen_string_literal: true

# Author: Preston Lee
class AiController < ApplicationController
  def health
    configured = Ollama::Client.configured?
    render json: {
      status: configured ? 'ok' : 'unconfigured',
      ollama_configured: configured,
      base_url: ENV['BIBLER_SERVER_OLLAMA_URL']
    }
  end

  def chat
    result = Ollama::ChatService.new.generate(
      prompt: params[:prompt].to_s,
      context: params[:context].is_a?(Hash) ? params[:context] : {},
      model: params[:model]
    )
    render json: result, status: result[:error].present? ? :unprocessable_entity : :ok
  end

  def comparator_commentary
    p = comparator_commentary_params
    primary = Bible.find_by(id: p[:primary_bible_uuid].to_s)
    secondary = Bible.find_by(id: p[:secondary_bible_uuid].to_s)

    unless primary && secondary
      render json: { error: 'Unknown primary or secondary Bible.' }, status: :unprocessable_entity
      return
    end

    chapter = p[:chapter]
    chapter_i = chapter.nil? ? 0 : chapter.to_i
    if chapter_i <= 0
      render json: { error: 'Chapter must be a positive integer.' }, status: :unprocessable_entity
      return
    end

    primary_book = primary.books.find_by(id: p[:primary_book_uuid].to_s)
    secondary_book = secondary.books.find_by(id: p[:secondary_book_uuid].to_s)

    unless primary_book && secondary_book
      render json: { error: 'Unknown primary or secondary book for the selected Bible.' }, status: :unprocessable_entity
      return
    end

    primary_rows = comparator_verse_rows(primary, primary_book, chapter_i)
    secondary_rows = comparator_verse_rows(secondary, secondary_book, chapter_i)

    if primary_rows.empty? || secondary_rows.empty?
      render json: { error: 'No verses found for this chapter in one or both translations.' }, status: :unprocessable_entity
      return
    end

    unless verses_aligned?(primary_rows, secondary_rows)
      render json: { error: 'Verse alignment is required: verse counts or ordinals do not match between translations.' },
             status: :unprocessable_entity
      return
    end

    context = {
      chapter: chapter_i,
      primary_bible: bible_metadata_for_comparator(primary),
      secondary_bible: bible_metadata_for_comparator(secondary),
      primary_book: { uuid: primary_book.uuid, name: primary_book.name },
      secondary_book: { uuid: secondary_book.uuid, name: secondary_book.name },
      primary_verses: primary_rows,
      secondary_verses: secondary_rows
    }

    result = comparator_llm_result(Ollama::ChatService.new, context)
    render json: result, status: comparator_http_status(result)
  end

  private

  def comparator_commentary_params
    src =
      if params[:comparator_commentary].is_a?(ActionController::Parameters)
        params.require(:comparator_commentary)
      else
        params
      end
    src.permit(
      :primary_bible_uuid, :secondary_bible_uuid, :primary_book_uuid, :secondary_book_uuid, :chapter
    ).to_unsafe_h.deep_symbolize_keys
  end

  def comparator_verse_rows(bible, book, chapter)
    Verse.where(bible:, book:, chapter:).order(:ordinal).map { |v| { ordinal: v.ordinal, text: v.text } }
  end

  def verses_aligned?(primary_rows, secondary_rows)
    return false if primary_rows.length != secondary_rows.length

    primary_rows.each_with_index do |pv, i|
      return false if pv[:ordinal] != secondary_rows[i][:ordinal]
    end
    true
  end

  def bible_metadata_for_comparator(bible)
    {
      uuid: bible.uuid,
      name: bible.name,
      abbreviation: bible.abbreviation,
      language: bible.language
    }
  end

  def comparator_llm_result(chat, context)
    user_content = Ollama::Prompts::Comparator.user_content(context)
    ollama_format =
      if ENV['BIBLER_SERVER_OLLAMA_COMPARATOR_JSON_FORMAT'].to_s == 'true'
        Ollama::Prompts::Comparator.ollama_output_format
      end
    chat.chat_with_system(
      system_message: Ollama::Prompts::Comparator.system_prompt,
      user_content: user_content,
      model: params[:model].presence,
      parse_json_output: true,
      ollama_format: ollama_format,
      ollama_options: comparator_ollama_options
    )
  end

  def comparator_service_error?(result)
    result[:error].present? || result['error'].present?
  end

  def comparator_http_status(result)
    comparator_service_error?(result) ? :unprocessable_entity : :ok
  end

  def comparator_ollama_options
    {
      temperature: 0.15,
      num_predict: Integer(ENV.fetch('BIBLER_SERVER_OLLAMA_COMPARATOR_NUM_PREDICT', '16384'))
    }
  rescue ArgumentError
    { temperature: 0.15, num_predict: 16_384 }
  end

end
