-- CreateTable
CREATE TABLE "task_plan_entries" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "entry_date" TIMESTAMP(3) NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "task_plan_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "task_plan_entries_task_id_entry_date_key" ON "task_plan_entries"("task_id", "entry_date");

-- CreateIndex
CREATE INDEX "task_plan_entries_project_id_task_id_idx" ON "task_plan_entries"("project_id", "task_id");

-- CreateIndex
CREATE INDEX "task_plan_entries_project_id_entry_date_idx" ON "task_plan_entries"("project_id", "entry_date");

-- AddForeignKey
ALTER TABLE "task_plan_entries" ADD CONSTRAINT "task_plan_entries_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_plan_entries" ADD CONSTRAINT "task_plan_entries_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
