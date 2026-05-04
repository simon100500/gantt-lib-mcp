ALTER TABLE "tasks"
ADD COLUMN "work_volume" DOUBLE PRECISION,
ADD COLUMN "work_unit" TEXT,
ADD COLUMN "completed_volume" DOUBLE PRECISION NOT NULL DEFAULT 0;

CREATE TABLE "task_progress_entries" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "entry_date" TIMESTAMP(3) NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "task_progress_entries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "task_progress_entries_task_id_entry_date_key" ON "task_progress_entries"("task_id", "entry_date");
CREATE INDEX "task_progress_entries_project_id_task_id_idx" ON "task_progress_entries"("project_id", "task_id");
CREATE INDEX "task_progress_entries_project_id_entry_date_idx" ON "task_progress_entries"("project_id", "entry_date");

ALTER TABLE "task_progress_entries"
ADD CONSTRAINT "task_progress_entries_project_id_fkey"
FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "task_progress_entries"
ADD CONSTRAINT "task_progress_entries_task_id_fkey"
FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
