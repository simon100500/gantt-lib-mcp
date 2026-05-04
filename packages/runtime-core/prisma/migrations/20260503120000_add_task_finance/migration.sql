CREATE TABLE "task_finance_settings" (
  "id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "task_id" TEXT NOT NULL,
  "planned_cost" DECIMAL(18,2) NOT NULL,
  "currency_code" TEXT NOT NULL DEFAULT 'RUB',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "task_finance_settings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "task_funding_events" (
  "id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "task_id" TEXT NOT NULL,
  "event_date" TIMESTAMP(3) NOT NULL,
  "amount" DECIMAL(18,2) NOT NULL,
  "comment" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "task_funding_events_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "task_finance_settings"
  ADD CONSTRAINT "task_finance_settings_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "task_finance_settings"
  ADD CONSTRAINT "task_finance_settings_task_id_fkey"
  FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "task_funding_events"
  ADD CONSTRAINT "task_funding_events_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "task_funding_events"
  ADD CONSTRAINT "task_funding_events_task_id_fkey"
  FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "task_finance_settings_task_id_key" ON "task_finance_settings"("task_id");
CREATE INDEX "task_finance_settings_project_id_idx" ON "task_finance_settings"("project_id");
CREATE INDEX "task_funding_events_project_id_task_id_idx" ON "task_funding_events"("project_id", "task_id");
CREATE INDEX "task_funding_events_project_id_event_date_idx" ON "task_funding_events"("project_id", "event_date");
