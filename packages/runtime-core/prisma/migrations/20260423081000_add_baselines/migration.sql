CREATE TYPE "BaselineSource" AS ENUM ('current', 'history');

CREATE TABLE "baselines" (
  "id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "source" "BaselineSource" NOT NULL,
  "source_history_group_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "baselines_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "baseline_tasks" (
  "id" TEXT NOT NULL,
  "baseline_id" TEXT NOT NULL,
  "task_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "start_date" TIMESTAMP(3) NOT NULL,
  "end_date" TIMESTAMP(3) NOT NULL,
  "type" "TaskType" NOT NULL DEFAULT 'task',
  "color" TEXT,
  "progress" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "parent_id" TEXT,
  "sort_order" INTEGER NOT NULL DEFAULT 0,

  CONSTRAINT "baseline_tasks_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "baseline_dependencies" (
  "id" TEXT NOT NULL,
  "baseline_id" TEXT NOT NULL,
  "dependency_id" TEXT NOT NULL,
  "task_id" TEXT NOT NULL,
  "dep_task_id" TEXT NOT NULL,
  "type" "DependencyType" NOT NULL,
  "lag" DOUBLE PRECISION NOT NULL DEFAULT 0,

  CONSTRAINT "baseline_dependencies_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "baseline_tasks_baseline_id_task_id_key" ON "baseline_tasks"("baseline_id", "task_id");
CREATE UNIQUE INDEX "baseline_dependencies_baseline_id_dependency_id_key" ON "baseline_dependencies"("baseline_id", "dependency_id");

CREATE INDEX "baselines_project_id_created_at_idx" ON "baselines"("project_id", "created_at" DESC);
CREATE INDEX "baselines_project_id_source_idx" ON "baselines"("project_id", "source");
CREATE INDEX "baselines_source_history_group_id_idx" ON "baselines"("source_history_group_id");
CREATE INDEX "baseline_tasks_baseline_id_sort_order_idx" ON "baseline_tasks"("baseline_id", "sort_order");
CREATE INDEX "baseline_tasks_baseline_id_parent_id_idx" ON "baseline_tasks"("baseline_id", "parent_id");
CREATE INDEX "baseline_dependencies_baseline_id_task_id_idx" ON "baseline_dependencies"("baseline_id", "task_id");
CREATE INDEX "baseline_dependencies_baseline_id_dep_task_id_idx" ON "baseline_dependencies"("baseline_id", "dep_task_id");

ALTER TABLE "baselines"
ADD CONSTRAINT "baselines_project_id_fkey"
FOREIGN KEY ("project_id") REFERENCES "projects"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "baseline_tasks"
ADD CONSTRAINT "baseline_tasks_baseline_id_fkey"
FOREIGN KEY ("baseline_id") REFERENCES "baselines"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "baseline_dependencies"
ADD CONSTRAINT "baseline_dependencies_baseline_id_fkey"
FOREIGN KEY ("baseline_id") REFERENCES "baselines"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
