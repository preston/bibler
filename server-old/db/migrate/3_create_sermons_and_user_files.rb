# frozen_string_literal: true

# Author: Preston Lee
class CreateSermonsAndUserFiles < ActiveRecord::Migration[8.1]
  def change
    create_table :sermons, id: :uuid, default: -> { 'gen_random_uuid()' } do |t|
      t.references :user, null: false, foreign_key: true, type: :uuid
      t.string :title, null: false
      t.string :visibility, default: 'private', null: false
      t.integer :target_duration_minutes
      t.timestamps
    end
    add_index :sermons, :visibility
    add_index :sermons, %i[user_id updated_at]

    create_table :sermon_sections, id: :uuid, default: -> { 'gen_random_uuid()' } do |t|
      t.references :sermon, null: false, foreign_key: true, type: :uuid
      t.integer :position, default: 0, null: false
      t.string :title, null: false, default: ''
      t.text :body
      t.integer :estimated_minutes
      t.timestamps
    end
    add_index :sermon_sections, %i[sermon_id position]

    create_table :sermon_section_verses, id: :uuid, default: -> { 'gen_random_uuid()' } do |t|
      t.references :sermon_section, null: false, foreign_key: true, type: :uuid
      t.string :bible_uuid, null: false
      t.string :book_uuid, null: false
      t.integer :chapter, null: false
      t.integer :ordinal, null: false
      t.integer :position, default: 0, null: false
      t.string :verse_uuid
      t.text :verse_text
      t.timestamps
    end
    add_index :sermon_section_verses, %i[sermon_section_id position]
    add_index :sermon_section_verses, :verse_uuid

    create_table :user_files, id: :uuid, default: -> { 'gen_random_uuid()' } do |t|
      t.references :user, null: false, foreign_key: true, type: :uuid
      t.string :original_filename, null: false
      t.text :extracted_text, null: false
      t.timestamps
    end
    add_index :user_files, %i[user_id updated_at]
  end
end
