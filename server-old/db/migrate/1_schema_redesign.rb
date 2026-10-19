# frozen_string_literal: true

# Squashed schema: UUID v4 primary keys (PostgreSQL gen_random_uuid) for all tables; FKs are uuid.
class SchemaRedesign < ActiveRecord::Migration[8.1]
  def up
    enable_extension 'pg_catalog.plpgsql'

    create_table :bibles, id: :uuid, default: -> { "gen_random_uuid()" } do |t|
      t.string :abbreviation, null: false
      t.boolean :ai_default_aramaic, default: false, null: false
      t.boolean :ai_default_english, default: false, null: false
      t.boolean :ai_default_greek, default: false, null: false
      t.boolean :ai_default_hebrew_ot, default: false, null: false
      t.datetime :created_at, precision: nil, null: false
      t.string :language, default: '', null: false
      t.text :license, default: ''
      t.string :name, null: false
      t.datetime :updated_at, precision: nil, null: false
      t.index :abbreviation, name: 'index_bibles_on_abbreviation', unique: true
      t.index :ai_default_aramaic, name: 'idx_bibles_ai_default_aramaic_true', unique: true, where: 'ai_default_aramaic'
      t.index :ai_default_english, name: 'idx_bibles_ai_default_english_true', unique: true, where: 'ai_default_english'
      t.index :ai_default_greek, name: 'idx_bibles_ai_default_greek_true', unique: true, where: 'ai_default_greek'
      t.index :ai_default_hebrew_ot, name: 'idx_bibles_ai_default_hebrew_true', unique: true, where: 'ai_default_hebrew_ot'
      t.index %i[name language], name: 'index_bibles_on_name_and_language', unique: true
    end

    create_table :books, id: :uuid, default: -> { "gen_random_uuid()" } do |t|
      t.uuid :bible_id, null: false
      t.datetime :created_at, precision: nil, null: false
      t.string :name, null: false
      t.integer :ordinal, null: false
      t.string :testament, null: false
      t.datetime :updated_at, precision: nil, null: false
      t.index %i[bible_id name], name: 'index_books_on_bible_id_and_name', unique: true
      t.index %i[bible_id testament ordinal], name: 'index_books_on_bible_id_and_testament_and_ordinal'
      t.index :bible_id, name: 'index_books_on_bible_id'
      t.index :ordinal, name: 'index_books_on_ordinal'
      t.check_constraint "testament IN ('old', 'new', 'other')", name: 'check_books_testament_enum'
    end

    create_table :mcp_sessions, id: :uuid, default: -> { "gen_random_uuid()" } do |t|
      t.datetime :created_at, null: false
      t.datetime :initialized_at, null: false
      t.datetime :last_activity_at, null: false
      t.string :last_event_id
      t.string :session_id, null: false
      t.datetime :updated_at, null: false
      t.index :last_activity_at, name: 'index_mcp_sessions_on_last_activity_at'
      t.index :session_id, name: 'index_mcp_sessions_on_session_id', unique: true
    end

    create_table :roles, id: :uuid, default: -> { "gen_random_uuid()" } do |t|
      t.boolean :access, default: false, null: false
      t.boolean :administrator, default: false, null: false
      t.boolean :bibles, default: false, null: false
      t.datetime :created_at, null: false
      t.boolean :curation, default: false, null: false
      t.boolean :is_default, default: false, null: false
      t.string :name, null: false
      t.datetime :updated_at, null: false
      t.index :name, name: 'index_roles_on_name', unique: true
    end

    create_table :users, id: :uuid, default: -> { "gen_random_uuid()" } do |t|
      t.string :api_token
      t.datetime :created_at, null: false
      t.string :email, default: '', null: false
      t.string :encrypted_password, default: '', null: false
      t.string :name, null: false
      t.datetime :remember_created_at
      t.datetime :reset_password_sent_at
      t.string :reset_password_token
      t.datetime :updated_at, null: false
      t.string :username, null: false
      t.index :api_token, name: 'index_users_on_api_token', unique: true
      t.index :email, name: 'index_users_on_email', unique: true
      t.index :reset_password_token, name: 'index_users_on_reset_password_token', unique: true
      t.index :username, name: 'index_users_on_username', unique: true
    end

    create_table :roles_users, id: :uuid, default: -> { "gen_random_uuid()" } do |t|
      t.uuid :role_id, null: false
      t.uuid :user_id, null: false
      t.index :role_id, name: 'index_roles_users_on_role_id'
      t.index %i[user_id role_id], name: 'index_roles_users_on_user_id_and_role_id', unique: true
      t.index :user_id, name: 'index_roles_users_on_user_id'
    end

    create_table :studies, id: :uuid, default: -> { "gen_random_uuid()" } do |t|
      t.datetime :created_at, null: false
      t.text :goal
      t.uuid :owner_id
      t.string :title, null: false
      t.datetime :updated_at, null: false
      t.string :visibility, default: 'private', null: false
      t.index :owner_id, name: 'index_studies_on_owner_id'
    end

    create_table :study_commentaries, id: :uuid, default: -> { "gen_random_uuid()" } do |t|
      t.text :body
      t.jsonb :context, default: {}, null: false
      t.datetime :created_at, null: false
      t.integer :position, default: 0, null: false
      t.text :prompt
      t.string :source_type, default: 'manual', null: false
      t.uuid :study_id, null: false
      t.string :title, null: false
      t.datetime :updated_at, null: false
      t.index %i[study_id position], name: 'index_study_commentaries_on_study_id_and_position'
      t.index :study_id, name: 'index_study_commentaries_on_study_id'
    end

    create_table :study_questions, id: :uuid, default: -> { "gen_random_uuid()" } do |t|
      t.datetime :created_at, null: false
      t.text :guidance_notes
      t.integer :position, default: 0, null: false
      t.text :prompt, null: false
      t.string :question_type, default: 'discussion', null: false
      t.uuid :study_id, null: false
      t.datetime :updated_at, null: false
      t.jsonb :verse_anchor, default: {}, null: false
      t.index %i[study_id position], name: 'index_study_questions_on_study_id_and_position'
      t.index :study_id, name: 'index_study_questions_on_study_id'
    end

    create_table :study_tasks, id: :uuid, default: -> { "gen_random_uuid()" } do |t|
      t.string :assignee_label
      t.jsonb :context, default: {}, null: false
      t.datetime :created_at, null: false
      t.datetime :due_at
      t.text :instruction, null: false
      t.integer :position, default: 0, null: false
      t.string :status, default: 'open', null: false
      t.uuid :study_id, null: false
      t.string :task_type, default: 'discussion', null: false
      t.datetime :updated_at, null: false
      t.index %i[study_id position], name: 'index_study_tasks_on_study_id_and_position'
      t.index :study_id, name: 'index_study_tasks_on_study_id'
    end

    create_table :study_plan_items, id: :uuid, default: -> { "gen_random_uuid()" } do |t|
      t.string :anchor
      t.datetime :created_at, null: false
      t.integer :duration
      t.string :item_type, null: false
      t.text :notes
      t.integer :position, default: 0, null: false
      t.string :resource_type
      t.string :resource_uuid
      t.uuid :study_id, null: false
      t.string :title, null: false
      t.datetime :updated_at, null: false
      t.index %i[study_id position], name: 'index_study_plan_items_on_study_id_and_position'
      t.index %i[study_id resource_type resource_uuid], name: 'index_plan_items_on_study_and_resource'
      t.index :study_id, name: 'index_study_plan_items_on_study_id'
    end

    create_table :study_plan_item_user_states, id: :uuid, default: -> { "gen_random_uuid()" } do |t|
      t.datetime :created_at, null: false
      t.string :status, default: 'todo', null: false
      t.uuid :study_plan_item_id, null: false
      t.datetime :updated_at, null: false
      t.uuid :user_id, null: false
      t.index :study_plan_item_id, name: 'index_study_plan_item_user_states_on_study_plan_item_id'
      t.index %i[user_id study_plan_item_id], name: 'idx_plan_item_user_state_unique', unique: true
      t.index :user_id, name: 'index_study_plan_item_user_states_on_user_id'
    end

    create_table :study_verses, id: :uuid, default: -> { "gen_random_uuid()" } do |t|
      t.string :bible_uuid, null: false
      t.string :book_uuid, null: false
      t.integer :chapter, null: false
      t.datetime :created_at, null: false
      t.text :note
      t.integer :ordinal, null: false
      t.integer :position, default: 0, null: false
      t.uuid :study_id, null: false
      t.datetime :updated_at, null: false
      t.text :verse_text
      t.string :verse_uuid
      t.index :bible_uuid, name: 'index_study_verses_on_bible_uuid'
      t.index :book_uuid, name: 'index_study_verses_on_book_uuid'
      t.index %i[study_id bible_uuid book_uuid chapter ordinal], name: 'idx_study_verses_lookup_uuid'
      t.index %i[study_id position], name: 'index_study_verses_on_study_id_and_position'
      t.index :study_id, name: 'index_study_verses_on_study_id'
      t.index :verse_uuid, name: 'index_study_verses_on_verse_uuid'
    end

    create_table :study_answers, id: :uuid, default: -> { "gen_random_uuid()" } do |t|
      t.string :author_label
      t.datetime :created_at, null: false
      t.text :response, null: false
      t.uuid :study_commentary_id
      t.uuid :study_id, null: false
      t.uuid :study_question_id, null: false
      t.datetime :updated_at, null: false
      t.uuid :user_id
      t.string :visibility, default: 'study', null: false
      t.index :study_commentary_id, name: 'index_study_answers_on_study_commentary_id'
      t.index :study_id, name: 'index_study_answers_on_study_id'
      t.index %i[study_question_id created_at], name: 'index_study_answers_on_study_question_id_and_created_at'
      t.index :study_question_id, name: 'index_study_answers_on_study_question_id'
      t.index :user_id, name: 'index_study_answers_on_user_id'
    end

    create_table :verses, id: :uuid, default: -> { "gen_random_uuid()" } do |t|
      t.uuid :bible_id, null: false
      t.uuid :book_id, null: false
      t.integer :chapter, null: false
      t.datetime :created_at, precision: nil, null: false
      t.integer :ordinal, null: false
      t.text :text, null: false
      t.datetime :updated_at, precision: nil, null: false
      t.index %i[bible_id book_id chapter ordinal], name: 'index_verses_on_bible_book_chapter_ordinal', unique: true
    end

    execute <<~SQL.squish
      CREATE INDEX verses_gin_text ON verses
      USING gin (to_tsvector('simple'::regconfig, COALESCE(text, ''::text)));
    SQL

    add_foreign_key :books, :bibles
    add_foreign_key :roles_users, :roles
    add_foreign_key :roles_users, :users
    add_foreign_key :studies, :users, column: :owner_id
    add_foreign_key :study_answers, :studies
    add_foreign_key :study_answers, :study_commentaries
    add_foreign_key :study_answers, :study_questions
    add_foreign_key :study_answers, :users
    add_foreign_key :study_commentaries, :studies
    add_foreign_key :study_plan_item_user_states, :study_plan_items
    add_foreign_key :study_plan_item_user_states, :users
    add_foreign_key :study_plan_items, :studies
    add_foreign_key :study_questions, :studies
    add_foreign_key :study_tasks, :studies
    add_foreign_key :study_verses, :studies
    add_foreign_key :verses, :bibles
    add_foreign_key :verses, :books
  end

  def down
    raise ActiveRecord::IrreversibleMigration
  end
end
