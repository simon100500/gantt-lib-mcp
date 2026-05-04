ALTER TABLE "task_finance_settings"
  ADD COLUMN "allocation_mode" TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN "allocation_parent_task_id" TEXT;

CREATE INDEX "task_finance_settings_project_id_allocation_parent_task_id_idx"
  ON "task_finance_settings"("project_id", "allocation_parent_task_id");
