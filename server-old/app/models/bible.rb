# frozen_string_literal: true

# Author: Preston Lee
class Bible < ApplicationRecord
  include UuidPrimaryKeyAsUuid

  has_many :verses, dependent: :destroy
  has_many :books, dependent: :destroy

  validates_presence_of :name
  validates_presence_of :abbreviation
  validates_presence_of :language

  validates_uniqueness_of :name, scope: :language
  validates_uniqueness_of :abbreviation
  validates_uniqueness_of :ai_default_english, if: :ai_default_english?
  validates_uniqueness_of :ai_default_hebrew_ot, if: :ai_default_hebrew_ot?
  validates_uniqueness_of :ai_default_greek, if: :ai_default_greek?
  validates_uniqueness_of :ai_default_aramaic, if: :ai_default_aramaic?

  scope :ai_default_english, -> { where(ai_default_english: true) }
  scope :ai_default_hebrew_ot, -> { where(ai_default_hebrew_ot: true) }
  scope :ai_default_greek, -> { where(ai_default_greek: true) }
  scope :ai_default_aramaic, -> { where(ai_default_aramaic: true) }

  # Mapping of language codes to human-readable names
  LANGUAGE_NAMES = {
    'en' => 'English',
    'es' => 'Spanish',
    'fr' => 'French',
    'de' => 'German',
    'pt' => 'Portuguese',
    'it' => 'Italian',
    'ru' => 'Russian',
    'ja' => 'Japanese',
    'ko' => 'Korean',
    'zh-hant' => 'Traditional Chinese',
    'zh' => 'Chinese',
    'ar' => 'Arabic',
    'he' => 'Hebrew',
    'hi' => 'Hindi',
    'th' => 'Thai',
    'vi' => 'Vietnamese',
    'nl' => 'Dutch',
    'pl' => 'Polish',
    'cs' => 'Czech',
    'sv' => 'Swedish',
    'da' => 'Danish',
    'fi' => 'Finnish',
    'no' => 'Norwegian',
    'nb' => 'Norwegian Bokmål',
    'nn' => 'Norwegian Nynorsk',
    'el' => 'Greek',
    'hu' => 'Hungarian',
    'ro' => 'Romanian',
    'uk' => 'Ukrainian',
    'bg' => 'Bulgarian',
    'hr' => 'Croatian',
    'sr' => 'Serbian',
    'sk' => 'Slovak',
    'sl' => 'Slovenian',
    'et' => 'Estonian',
    'lv' => 'Latvian',
    'lt' => 'Lithuanian',
    'sq' => 'Albanian',
    'mt' => 'Maltese',
    'is' => 'Icelandic',
    'ga' => 'Irish',
    'cy' => 'Welsh',
    'eu' => 'Basque',
    'ca' => 'Catalan',
    'gl' => 'Galician',
    'la' => 'Latin',
    'grc' => 'Ancient Greek',
    'got' => 'Gothic',
    'enm' => 'Middle English',
    'cop-sa' => 'Coptic (Sahidic)',
    'syr' => 'Syriac',
    'hbo' => 'Ancient Hebrew',
    'ceb' => 'Cebuano',
    'chr' => 'Cherokee',
    'eo' => 'Esperanto',
    'ht' => 'Haitian Creole',
    'hy' => 'Armenian',
    'lzh' => 'Literary Chinese',
    'mg' => 'Malagasy',
    'mi' => 'Māori',
    'my' => 'Myanmar (Burmese)',
    'pon' => 'Pohnpeian',
    'tl' => 'Tagalog',
    'tlh' => 'Klingon',
    'tpi' => 'Tok Pisin',
    'tsg' => 'Tausug',
    'vls' => 'West Flemish',
    'bea' => 'Beaver',
    'cu' => 'Church Slavonic',
    'gv' => 'Manx',
    'mlf' => 'Malagasy (Merina)',
    'sml' => 'Central Sama'
  }.freeze

  def self.default_ai_reference_bibles
    {
      english: ai_default_english.first || by_language_fallback(%w[en]),
      hebrew_ot: ai_default_hebrew_ot.first || by_language_fallback(%w[hbo he]),
      greek: ai_default_greek.first || by_language_fallback(%w[grc el]),
      aramaic: ai_default_aramaic.first || by_language_fallback(%w[arc syr])
    }.transform_values do |b|
      b&.slice(:uuid, :abbreviation, :name, :language)
    end
  end

  def self.by_language_fallback(codes)
    where(language: codes).order(:id).first
  end

end
