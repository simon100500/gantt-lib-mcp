ALTER TABLE "projects"
ADD COLUMN "hidden_task_list_columns_default" JSONB;

CREATE TABLE "project_view_preferences" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "hidden_task_list_columns" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "project_view_preferences_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "project_view_preferences_user_id_project_id_key"
  ON "project_view_preferences"("user_id", "project_id");

CREATE INDEX "project_view_preferences_project_id_idx"
  ON "project_view_preferences"("project_id");

ALTER TABLE "project_view_preferences"
  ADD CONSTRAINT "project_view_preferences_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "project_view_preferences"
  ADD CONSTRAINT "project_view_preferences_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
