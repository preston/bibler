# frozen_string_literal: true

module System
  class SettingsController < ApplicationController
    SORTABLE_COLUMNS = {
      'name' => 'name',
      'uuid' => 'id',
      'language' => 'language',
      'abbreviation' => 'abbreviation',
      'updated_at' => 'updated_at'
    }.freeze
    DEFAULT_PER_PAGE = 25
    MAX_PER_PAGE = 100

    def ai_defaults
      authorize! :read, :system_ai_settings
      scoped = Bible.all
      q = params[:q].to_s.strip
      if q.present?
        scoped = scoped.where(
          'name ILIKE :q OR CAST(id AS text) ILIKE :q OR abbreviation ILIKE :q OR language ILIKE :q',
          q: "%#{q}%"
        )
      end

      sort_col = SORTABLE_COLUMNS.fetch(params[:sort].to_s, 'name')
      dir = normalized_direction
      scoped = scoped.order(sort_col => dir)

      page = normalized_page
      per_page = clamped_per_page
      total_count = scoped.count
      total_pages = (total_count.to_f / per_page).ceil
      offset = (page - 1) * per_page

      rows = scoped.offset(offset).limit(per_page)
      render json: {
        bibles: rows.map { |b| serialize_bible(b) },
        meta: {
          page: page,
          per_page: per_page,
          total_count: total_count,
          total_pages: total_pages,
          sort: sort_col,
          direction: dir,
          q: q
        }
      }
    end

    def update_ai_defaults
      authorize! :manage, :system_ai_settings
      updates = Array(params[:defaults])
      Bible.transaction do
        Bible.update_all(
          ai_default_english: false,
          ai_default_hebrew_ot: false,
          ai_default_greek: false,
          ai_default_aramaic: false
        )

        updates.each do |row|
          h = row.is_a?(ActionController::Parameters) ? row.to_unsafe_h : row
          next unless h.is_a?(Hash)

          bible = Bible.find_by(id: h['uuid'].to_s)
          next unless bible

          bible.update!(
            ai_default_english: truthy?(h['ai_default_english']),
            ai_default_hebrew_ot: truthy?(h['ai_default_hebrew_ot']),
            ai_default_greek: truthy?(h['ai_default_greek']),
            ai_default_aramaic: truthy?(h['ai_default_aramaic'])
          )
        end
      end

      render json: { bibles: Bible.order(:name).map { |b| serialize_bible(b) } }
    end

    private

    def truthy?(v)
      [true, 1, '1', 'true', 'yes', 'on'].include?(v)
    end

    def normalized_direction
      params[:direction].to_s.casecmp('asc').zero? ? :asc : :desc
    end

    def clamped_per_page
      raw = params[:per_page].to_i
      raw = DEFAULT_PER_PAGE if raw <= 0
      [raw, MAX_PER_PAGE].min
    end

    def normalized_page
      raw = params[:page].to_i
      raw < 1 ? 1 : raw
    end

    def serialize_bible(b)
      b.slice(
        :id, :uuid, :name, :abbreviation, :language, :license,
        :ai_default_english, :ai_default_hebrew_ot, :ai_default_greek, :ai_default_aramaic
      )
    end
  end
end
