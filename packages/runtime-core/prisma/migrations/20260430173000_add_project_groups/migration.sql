-- Add project groups and scope shared resources to a group instead of the whole account.

CREATE TABLE "project_groups" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "is_default" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "project_groups_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "project_groups"
  ADD CONSTRAINT "project_groups_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "project_groups_user_id_idx" ON "project_groups"("user_id");
CREATE UNIQUE INDEX "project_groups_one_default_per_user" ON "project_groups"("user_id") WHERE "is_default" = true;

INSERT INTO "project_groups" ("id", "user_id", "name", "is_default", "created_at", "updated_at")
SELECT md5("id" || ':default-project-group'), "id", 'Проекты', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "users";

ALTER TABLE "projects" ADD COLUMN "group_id" TEXT;
ALTER TABLE "resources" ADD COLUMN "project_group_id" TEXT;

UPDATE "projects" p
SET "group_id" = pg."id"
FROM "project_groups" pg
WHERE pg."user_id" = p."user_id"
  AND pg."is_default" = true;

UPDATE "resources" r
SET "project_group_id" = pg."id"
FROM "project_groups" pg
WHERE pg."user_id" = r."user_id"
  AND pg."is_default" = true
  AND r."project_id" IS NULL;

ALTER TABLE "projects" ALTER COLUMN "group_id" SET NOT NULL;

ALTER TABLE "projects"
  ADD CONSTRAINT "projects_group_id_fkey"
  FOREIGN KEY ("group_id") REFERENCES "project_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "resources"
  ADD CONSTRAINT "resources_project_group_id_fkey"
  FOREIGN KEY ("project_group_id") REFERENCES "project_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "projects_group_id_idx" ON "projects"("group_id");
CREATE INDEX "resources_project_group_id_idx" ON "resources"("project_group_id");
CREATE INDEX "resources_user_id_project_group_id_is_active_idx" ON "resources"("user_id", "project_group_id", "is_active");
