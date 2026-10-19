-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "ar_internal_metadata" (
    "key" VARCHAR NOT NULL,
    "value" VARCHAR,
    "created_at" TIMESTAMP(6) NOT NULL,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "ar_internal_metadata_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "bibles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "abbreviation" VARCHAR NOT NULL,
    "ai_default_aramaic" BOOLEAN NOT NULL DEFAULT false,
    "ai_default_english" BOOLEAN NOT NULL DEFAULT false,
    "ai_default_greek" BOOLEAN NOT NULL DEFAULT false,
    "ai_default_hebrew_ot" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP NOT NULL,
    "language" VARCHAR NOT NULL DEFAULT '',
    "license" TEXT DEFAULT '',
    "name" VARCHAR NOT NULL,
    "updated_at" TIMESTAMP NOT NULL,

    CONSTRAINT "bibles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "books" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "bible_id" UUID NOT NULL,
    "created_at" TIMESTAMP NOT NULL,
    "name" VARCHAR NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "testament" VARCHAR NOT NULL,
    "updated_at" TIMESTAMP NOT NULL,

    CONSTRAINT "books_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "created_at" TIMESTAMP(6) NOT NULL,
    "extracted_text" TEXT NOT NULL,
    "original_filename" VARCHAR NOT NULL,
    "updated_at" TIMESTAMP(6) NOT NULL,
    "user_id" UUID NOT NULL,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mcp_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "created_at" TIMESTAMP(6) NOT NULL,
    "initialized_at" TIMESTAMP(6) NOT NULL,
    "last_activity_at" TIMESTAMP(6) NOT NULL,
    "last_event_id" VARCHAR,
    "session_id" VARCHAR NOT NULL,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "mcp_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "access" BOOLEAN NOT NULL DEFAULT false,
    "administrator" BOOLEAN NOT NULL DEFAULT false,
    "bibles" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(6) NOT NULL,
    "curation" BOOLEAN NOT NULL DEFAULT false,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "name" VARCHAR NOT NULL,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles_users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "role_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,

    CONSTRAINT "roles_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schema_migrations" (
    "version" VARCHAR NOT NULL,

    CONSTRAINT "schema_migrations_pkey" PRIMARY KEY ("version")
);

-- CreateTable
CREATE TABLE "sermon_section_verses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "bible_uuid" VARCHAR NOT NULL,
    "book_uuid" VARCHAR NOT NULL,
    "chapter" INTEGER NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "sermon_section_id" UUID NOT NULL,
    "updated_at" TIMESTAMP(6) NOT NULL,
    "verse_text" TEXT,
    "verse_uuid" VARCHAR,

    CONSTRAINT "sermon_section_verses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sermon_sections" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "body" TEXT,
    "created_at" TIMESTAMP(6) NOT NULL,
    "estimated_minutes" INTEGER,
    "position" INTEGER NOT NULL DEFAULT 0,
    "sermon_id" UUID NOT NULL,
    "title" VARCHAR NOT NULL DEFAULT '',
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "sermon_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sermons" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "created_at" TIMESTAMP(6) NOT NULL,
    "target_duration_minutes" INTEGER,
    "title" VARCHAR NOT NULL,
    "updated_at" TIMESTAMP(6) NOT NULL,
    "user_id" UUID NOT NULL,
    "visibility" VARCHAR NOT NULL DEFAULT 'private',

    CONSTRAINT "sermons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "studies" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "created_at" TIMESTAMP(6) NOT NULL,
    "goal" TEXT,
    "owner_id" UUID,
    "title" VARCHAR NOT NULL,
    "updated_at" TIMESTAMP(6) NOT NULL,
    "visibility" VARCHAR NOT NULL DEFAULT 'private',

    CONSTRAINT "studies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "study_answers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "author_label" VARCHAR,
    "created_at" TIMESTAMP(6) NOT NULL,
    "response" TEXT NOT NULL,
    "study_commentary_id" UUID,
    "study_id" UUID NOT NULL,
    "study_question_id" UUID NOT NULL,
    "updated_at" TIMESTAMP(6) NOT NULL,
    "user_id" UUID,
    "visibility" VARCHAR NOT NULL DEFAULT 'study',

    CONSTRAINT "study_answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "study_assignments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "created_at" TIMESTAMP(6) NOT NULL,
    "study_id" UUID NOT NULL,
    "updated_at" TIMESTAMP(6) NOT NULL,
    "user_id" UUID NOT NULL,

    CONSTRAINT "study_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "study_commentaries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "body" TEXT,
    "context" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(6) NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "prompt" TEXT,
    "source_type" VARCHAR NOT NULL DEFAULT 'manual',
    "study_id" UUID NOT NULL,
    "title" VARCHAR NOT NULL,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "study_commentaries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "study_plan_item_user_states" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "created_at" TIMESTAMP(6) NOT NULL,
    "status" VARCHAR NOT NULL DEFAULT 'todo',
    "study_plan_item_id" UUID NOT NULL,
    "updated_at" TIMESTAMP(6) NOT NULL,
    "user_id" UUID NOT NULL,

    CONSTRAINT "study_plan_item_user_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "study_plan_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "anchor" VARCHAR,
    "created_at" TIMESTAMP(6) NOT NULL,
    "duration" INTEGER,
    "item_type" VARCHAR NOT NULL,
    "notes" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "resource_type" VARCHAR,
    "resource_uuid" VARCHAR,
    "study_id" UUID NOT NULL,
    "title" VARCHAR NOT NULL,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "study_plan_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "study_questions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "created_at" TIMESTAMP(6) NOT NULL,
    "guidance_notes" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "prompt" TEXT NOT NULL,
    "question_type" VARCHAR NOT NULL DEFAULT 'discussion',
    "study_id" UUID NOT NULL,
    "updated_at" TIMESTAMP(6) NOT NULL,
    "verse_anchor" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "study_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "study_tasks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "assignee_label" VARCHAR,
    "context" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(6) NOT NULL,
    "due_at" TIMESTAMP(6),
    "instruction" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "status" VARCHAR NOT NULL DEFAULT 'open',
    "study_id" UUID NOT NULL,
    "task_type" VARCHAR NOT NULL DEFAULT 'discussion',
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "study_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "study_verses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "bible_uuid" VARCHAR NOT NULL,
    "book_uuid" VARCHAR NOT NULL,
    "chapter" INTEGER NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL,
    "note" TEXT,
    "ordinal" INTEGER NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "study_id" UUID NOT NULL,
    "updated_at" TIMESTAMP(6) NOT NULL,
    "verse_text" TEXT,
    "verse_uuid" VARCHAR,

    CONSTRAINT "study_verses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "api_token" VARCHAR,
    "created_at" TIMESTAMP(6) NOT NULL,
    "email" VARCHAR NOT NULL DEFAULT '',
    "encrypted_password" VARCHAR NOT NULL DEFAULT '',
    "name" VARCHAR NOT NULL,
    "remember_created_at" TIMESTAMP(6),
    "reset_password_sent_at" TIMESTAMP(6),
    "reset_password_token" VARCHAR,
    "updated_at" TIMESTAMP(6) NOT NULL,
    "username" VARCHAR NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "bible_id" UUID NOT NULL,
    "book_id" UUID NOT NULL,
    "chapter" INTEGER NOT NULL,
    "created_at" TIMESTAMP NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "updated_at" TIMESTAMP NOT NULL,

    CONSTRAINT "verses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "index_bibles_on_abbreviation" ON "bibles"("abbreviation");

-- CreateIndex
CREATE UNIQUE INDEX "idx_bibles_ai_default_aramaic_true" ON "bibles"("ai_default_aramaic") WHERE (ai_default_aramaic);

-- CreateIndex
CREATE UNIQUE INDEX "idx_bibles_ai_default_english_true" ON "bibles"("ai_default_english") WHERE (ai_default_english);

-- CreateIndex
CREATE UNIQUE INDEX "idx_bibles_ai_default_greek_true" ON "bibles"("ai_default_greek") WHERE (ai_default_greek);

-- CreateIndex
CREATE UNIQUE INDEX "idx_bibles_ai_default_hebrew_true" ON "bibles"("ai_default_hebrew_ot") WHERE (ai_default_hebrew_ot);

-- CreateIndex
CREATE UNIQUE INDEX "index_bibles_on_name_and_language" ON "bibles"("name", "language");

-- CreateIndex
CREATE INDEX "index_books_on_bible_id" ON "books"("bible_id");

-- CreateIndex
CREATE INDEX "index_books_on_bible_id_and_testament_and_ordinal" ON "books"("bible_id", "testament", "ordinal");

-- CreateIndex
CREATE INDEX "index_books_on_ordinal" ON "books"("ordinal");

-- CreateIndex
CREATE UNIQUE INDEX "index_books_on_bible_id_and_name" ON "books"("bible_id", "name");

-- CreateIndex
CREATE INDEX "index_documents_on_user_id" ON "documents"("user_id");

-- CreateIndex
CREATE INDEX "index_documents_on_user_id_and_updated_at" ON "documents"("user_id", "updated_at");

-- CreateIndex
CREATE UNIQUE INDEX "index_mcp_sessions_on_session_id" ON "mcp_sessions"("session_id");

-- CreateIndex
CREATE INDEX "index_mcp_sessions_on_last_activity_at" ON "mcp_sessions"("last_activity_at");

-- CreateIndex
CREATE UNIQUE INDEX "index_roles_on_name" ON "roles"("name");

-- CreateIndex
CREATE INDEX "index_roles_users_on_role_id" ON "roles_users"("role_id");

-- CreateIndex
CREATE INDEX "index_roles_users_on_user_id" ON "roles_users"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "index_roles_users_on_user_id_and_role_id" ON "roles_users"("user_id", "role_id");

-- CreateIndex
CREATE INDEX "index_sermon_section_verses_on_sermon_section_id" ON "sermon_section_verses"("sermon_section_id");

-- CreateIndex
CREATE INDEX "index_sermon_section_verses_on_sermon_section_id_and_position" ON "sermon_section_verses"("sermon_section_id", "position");

-- CreateIndex
CREATE INDEX "index_sermon_section_verses_on_verse_uuid" ON "sermon_section_verses"("verse_uuid");

-- CreateIndex
CREATE INDEX "index_sermon_sections_on_sermon_id" ON "sermon_sections"("sermon_id");

-- CreateIndex
CREATE INDEX "index_sermon_sections_on_sermon_id_and_position" ON "sermon_sections"("sermon_id", "position");

-- CreateIndex
CREATE INDEX "index_sermons_on_user_id" ON "sermons"("user_id");

-- CreateIndex
CREATE INDEX "index_sermons_on_user_id_and_updated_at" ON "sermons"("user_id", "updated_at");

-- CreateIndex
CREATE INDEX "index_sermons_on_visibility" ON "sermons"("visibility");

-- CreateIndex
CREATE INDEX "index_studies_on_owner_id" ON "studies"("owner_id");

-- CreateIndex
CREATE INDEX "index_study_answers_on_study_commentary_id" ON "study_answers"("study_commentary_id");

-- CreateIndex
CREATE INDEX "index_study_answers_on_study_id" ON "study_answers"("study_id");

-- CreateIndex
CREATE INDEX "index_study_answers_on_study_question_id" ON "study_answers"("study_question_id");

-- CreateIndex
CREATE INDEX "index_study_answers_on_study_question_id_and_created_at" ON "study_answers"("study_question_id", "created_at");

-- CreateIndex
CREATE INDEX "index_study_answers_on_user_id" ON "study_answers"("user_id");

-- CreateIndex
CREATE INDEX "index_study_assignments_on_study_id" ON "study_assignments"("study_id");

-- CreateIndex
CREATE INDEX "index_study_assignments_on_user_id" ON "study_assignments"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "index_study_assignments_on_study_id_and_user_id" ON "study_assignments"("study_id", "user_id");

-- CreateIndex
CREATE INDEX "index_study_commentaries_on_study_id" ON "study_commentaries"("study_id");

-- CreateIndex
CREATE INDEX "index_study_commentaries_on_study_id_and_position" ON "study_commentaries"("study_id", "position");

-- CreateIndex
CREATE INDEX "index_study_plan_item_user_states_on_study_plan_item_id" ON "study_plan_item_user_states"("study_plan_item_id");

-- CreateIndex
CREATE INDEX "index_study_plan_item_user_states_on_user_id" ON "study_plan_item_user_states"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "idx_plan_item_user_state_unique" ON "study_plan_item_user_states"("user_id", "study_plan_item_id");

-- CreateIndex
CREATE INDEX "index_plan_items_on_study_and_resource" ON "study_plan_items"("study_id", "resource_type", "resource_uuid");

-- CreateIndex
CREATE INDEX "index_study_plan_items_on_study_id" ON "study_plan_items"("study_id");

-- CreateIndex
CREATE INDEX "index_study_plan_items_on_study_id_and_position" ON "study_plan_items"("study_id", "position");

-- CreateIndex
CREATE INDEX "index_study_questions_on_study_id" ON "study_questions"("study_id");

-- CreateIndex
CREATE INDEX "index_study_questions_on_study_id_and_position" ON "study_questions"("study_id", "position");

-- CreateIndex
CREATE INDEX "index_study_tasks_on_study_id" ON "study_tasks"("study_id");

-- CreateIndex
CREATE INDEX "index_study_tasks_on_study_id_and_position" ON "study_tasks"("study_id", "position");

-- CreateIndex
CREATE INDEX "idx_study_verses_lookup_uuid" ON "study_verses"("study_id", "bible_uuid", "book_uuid", "chapter", "ordinal");

-- CreateIndex
CREATE INDEX "index_study_verses_on_bible_uuid" ON "study_verses"("bible_uuid");

-- CreateIndex
CREATE INDEX "index_study_verses_on_book_uuid" ON "study_verses"("book_uuid");

-- CreateIndex
CREATE INDEX "index_study_verses_on_study_id" ON "study_verses"("study_id");

-- CreateIndex
CREATE INDEX "index_study_verses_on_study_id_and_position" ON "study_verses"("study_id", "position");

-- CreateIndex
CREATE INDEX "index_study_verses_on_verse_uuid" ON "study_verses"("verse_uuid");

-- CreateIndex
CREATE UNIQUE INDEX "index_users_on_api_token" ON "users"("api_token");

-- CreateIndex
CREATE UNIQUE INDEX "index_users_on_email" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "index_users_on_reset_password_token" ON "users"("reset_password_token");

-- CreateIndex
CREATE UNIQUE INDEX "index_users_on_username" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "index_verses_on_bible_book_chapter_ordinal" ON "verses"("bible_id", "book_id", "chapter", "ordinal");

-- AddForeignKey
ALTER TABLE "books" ADD CONSTRAINT "fk_rails_2a229d7e26" FOREIGN KEY ("bible_id") REFERENCES "bibles"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "fk_rails_2be0318c46" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "roles_users" ADD CONSTRAINT "fk_rails_9dada905f6" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "roles_users" ADD CONSTRAINT "fk_rails_e2a7142459" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "sermon_section_verses" ADD CONSTRAINT "fk_rails_ec61c299eb" FOREIGN KEY ("sermon_section_id") REFERENCES "sermon_sections"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "sermon_sections" ADD CONSTRAINT "fk_rails_a8a5febfdd" FOREIGN KEY ("sermon_id") REFERENCES "sermons"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "sermons" ADD CONSTRAINT "fk_rails_f6b0cd5569" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "studies" ADD CONSTRAINT "fk_rails_f0b9f60ddd" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "study_answers" ADD CONSTRAINT "fk_rails_1ffc893bfe" FOREIGN KEY ("study_question_id") REFERENCES "study_questions"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "study_answers" ADD CONSTRAINT "fk_rails_31e14e99c7" FOREIGN KEY ("study_id") REFERENCES "studies"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "study_answers" ADD CONSTRAINT "fk_rails_88efe0a3b6" FOREIGN KEY ("study_commentary_id") REFERENCES "study_commentaries"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "study_answers" ADD CONSTRAINT "fk_rails_c6a78633d8" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "study_assignments" ADD CONSTRAINT "fk_rails_3fca42ccec" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "study_assignments" ADD CONSTRAINT "fk_rails_a11c8d2c58" FOREIGN KEY ("study_id") REFERENCES "studies"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "study_commentaries" ADD CONSTRAINT "fk_rails_78b8b27c41" FOREIGN KEY ("study_id") REFERENCES "studies"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "study_plan_item_user_states" ADD CONSTRAINT "fk_rails_40ee3fa13b" FOREIGN KEY ("study_plan_item_id") REFERENCES "study_plan_items"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "study_plan_item_user_states" ADD CONSTRAINT "fk_rails_7c369e9f09" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "study_plan_items" ADD CONSTRAINT "fk_rails_2b3a05c931" FOREIGN KEY ("study_id") REFERENCES "studies"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "study_questions" ADD CONSTRAINT "fk_rails_6522f4e2a1" FOREIGN KEY ("study_id") REFERENCES "studies"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "study_tasks" ADD CONSTRAINT "fk_rails_796fb1b4ff" FOREIGN KEY ("study_id") REFERENCES "studies"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "study_verses" ADD CONSTRAINT "fk_rails_98a2a74569" FOREIGN KEY ("study_id") REFERENCES "studies"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "verses" ADD CONSTRAINT "fk_rails_892fe8ab53" FOREIGN KEY ("bible_id") REFERENCES "bibles"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "verses" ADD CONSTRAINT "fk_rails_e0ba489b1e" FOREIGN KEY ("book_id") REFERENCES "books"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- Database-derived features outside the Prisma schema.
CREATE INDEX verses_gin_text ON public.verses USING gin (to_tsvector('simple'::regconfig, COALESCE(text, ''::text)));
ALTER TABLE public.books ADD CONSTRAINT check_books_testament_enum CHECK (((testament)::text = ANY (ARRAY[('old'::character varying)::text, ('new'::character varying)::text, ('other'::character varying)::text])));
