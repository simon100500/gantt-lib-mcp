CREATE TYPE "FactDayCloseState" AS ENUM ('fact', 'done', 'not_worked', 'problem');

CREATE TABLE "fact_access_tokens" (
  "id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "included_task_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "label" TEXT NOT NULL DEFAULT '',
  "revoked_at" TIMESTAMP(3),
  "expires_at" TIMESTAMP(3),
  "created_by_user_id" TEXT NOT NULL,
  "last_used_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "fact_access_tokens_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "fact_day_close_entries" (
  "id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "task_id" TEXT NOT NULL,
  "date" TIMESTAMP(3) NOT NULL,
  "state" "FactDayCloseState" NOT NULL,
  "reason" TEXT,
  "comment" TEXT,
  "token_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "fact_day_close_entries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "fact_access_tokens_slug_key" ON "fact_access_tokens"("slug");
CREATE INDEX "fact_access_tokens_project_id_idx" ON "fact_access_tokens"("project_id");
CREATE INDEX "fact_access_tokens_project_id_revoked_at_idx" ON "fact_access_tokens"("project_id", "revoked_at");
CREATE INDEX "fact_access_tokens_expires_at_idx" ON "fact_access_tokens"("expires_at");

CREATE UNIQUE INDEX "fact_day_close_entries_task_id_date_token_id_key" ON "fact_day_close_entries"("task_id", "date", "token_id");
CREATE INDEX "fact_day_close_entries_project_id_date_idx" ON "fact_day_close_entries"("project_id", "date");
CREATE INDEX "fact_day_close_entries_token_id_idx" ON "fact_day_close_entries"("token_id");

ALTER TABLE "fact_access_tokens" ADD CONSTRAINT "fact_access_tokens_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "fact_access_tokens" ADD CONSTRAINT "fact_access_tokens_created_by_user_id_fkey"
  FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "fact_day_close_entries" ADD CONSTRAINT "fact_day_close_entries_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "fact_day_close_entries" ADD CONSTRAINT "fact_day_close_entries_task_id_fkey"
  FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "fact_day_close_entries" ADD CONSTRAINT "fact_day_close_entries_token_id_fkey"
  FOREIGN KEY ("token_id") REFERENCES "fact_access_tokens"("id") ON DELETE CASCADE ON UPDATE CASCADE;
