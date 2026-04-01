CREATE TYPE "ProjectStatus" AS ENUM ('active', 'archived', 'deleted');

ALTER TABLE "projects"
ADD COLUMN "status" "ProjectStatus" NOT NULL DEFAULT 'active',
ADD COLUMN "archived_at" TIMESTAMP(3),
ADD COLUMN "deleted_at" TIMESTAMP(3);

CREATE INDEX "projects_user_id_status_idx" ON "projects"("user_id", "status");
