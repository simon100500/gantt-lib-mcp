DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ResourceType') THEN
    CREATE TYPE "ResourceType" AS ENUM ('human', 'equipment', 'material', 'other');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "resources" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "project_id" TEXT,
  "name" TEXT NOT NULL,
  "type" "ResourceType" NOT NULL DEFAULT 'human',
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "deactivated_at" TIMESTAMP(3),

  CONSTRAINT "resources_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "task_assignments" (
  "id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "task_id" TEXT NOT NULL,
  "resource_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "task_assignments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "resources_user_id_idx" ON "resources"("user_id");
CREATE INDEX IF NOT EXISTS "resources_project_id_idx" ON "resources"("project_id");
CREATE INDEX IF NOT EXISTS "resources_user_id_is_active_idx" ON "resources"("user_id", "is_active");
CREATE INDEX IF NOT EXISTS "resources_user_id_project_id_is_active_idx" ON "resources"("user_id", "project_id", "is_active");

CREATE UNIQUE INDEX IF NOT EXISTS "task_assignments_task_id_resource_id_key" ON "task_assignments"("task_id", "resource_id");
CREATE INDEX IF NOT EXISTS "task_assignments_project_id_task_id_idx" ON "task_assignments"("project_id", "task_id");
CREATE INDEX IF NOT EXISTS "task_assignments_project_id_resource_id_idx" ON "task_assignments"("project_id", "resource_id");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'resources_user_id_fkey') THEN
    ALTER TABLE "resources"
    ADD CONSTRAINT "resources_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'resources_project_id_fkey') THEN
    ALTER TABLE "resources"
    ADD CONSTRAINT "resources_project_id_fkey"
    FOREIGN KEY ("project_id") REFERENCES "projects"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'task_assignments_project_id_fkey') THEN
    ALTER TABLE "task_assignments"
    ADD CONSTRAINT "task_assignments_project_id_fkey"
    FOREIGN KEY ("project_id") REFERENCES "projects"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'task_assignments_task_id_fkey') THEN
    ALTER TABLE "task_assignments"
    ADD CONSTRAINT "task_assignments_task_id_fkey"
    FOREIGN KEY ("task_id") REFERENCES "tasks"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'task_assignments_resource_id_fkey') THEN
    ALTER TABLE "task_assignments"
    ADD CONSTRAINT "task_assignments_resource_id_fkey"
    FOREIGN KEY ("resource_id") REFERENCES "resources"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
