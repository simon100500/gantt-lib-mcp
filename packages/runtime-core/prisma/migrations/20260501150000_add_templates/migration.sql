-- Create enum
CREATE TYPE "TemplateSourceKind" AS ENUM ('project', 'task_selection');

-- Create templates table
CREATE TABLE "templates" (
  "id" TEXT NOT NULL,
  "owner_user_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "source_kind" "TemplateSourceKind" NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "templates_pkey" PRIMARY KEY ("id")
);

-- Create template_tasks table
CREATE TABLE "template_tasks" (
  "id" TEXT NOT NULL,
  "template_id" TEXT NOT NULL,
  "local_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" "TaskType" NOT NULL DEFAULT 'task',
  "color" TEXT,
  "parent_local_id" TEXT,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "relative_start_offset" INTEGER NOT NULL DEFAULT 0,
  "duration_days" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "template_tasks_pkey" PRIMARY KEY ("id")
);

-- Create template_dependencies table
CREATE TABLE "template_dependencies" (
  "id" TEXT NOT NULL,
  "template_id" TEXT NOT NULL,
  "source_local_id" TEXT NOT NULL,
  "target_local_id" TEXT NOT NULL,
  "type" "DependencyType" NOT NULL,
  "lag" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "template_dependencies_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE INDEX "templates_owner_user_id_updated_at_idx" ON "templates"("owner_user_id", "updated_at" DESC);
CREATE UNIQUE INDEX "template_tasks_template_id_local_id_key" ON "template_tasks"("template_id", "local_id");
CREATE INDEX "template_tasks_template_id_sort_order_idx" ON "template_tasks"("template_id", "sort_order");
CREATE INDEX "template_dependencies_template_id_idx" ON "template_dependencies"("template_id");
CREATE INDEX "template_dependencies_template_id_source_local_id_idx" ON "template_dependencies"("template_id", "source_local_id");
CREATE INDEX "template_dependencies_template_id_target_local_id_idx" ON "template_dependencies"("template_id", "target_local_id");

-- Foreign keys
ALTER TABLE "templates"
  ADD CONSTRAINT "templates_owner_user_id_fkey"
  FOREIGN KEY ("owner_user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "template_tasks"
  ADD CONSTRAINT "template_tasks_template_id_fkey"
  FOREIGN KEY ("template_id") REFERENCES "templates"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "template_dependencies"
  ADD CONSTRAINT "template_dependencies_template_id_fkey"
  FOREIGN KEY ("template_id") REFERENCES "templates"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
