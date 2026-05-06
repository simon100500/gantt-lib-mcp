CREATE TYPE "ProjectSectionAccess" AS ENUM ('view', 'edit');

ALTER TABLE "project_group_members"
ADD COLUMN "schedule_access" "ProjectSectionAccess",
ADD COLUMN "resources_access" "ProjectSectionAccess",
ADD COLUMN "finance_access" "ProjectSectionAccess";

UPDATE "project_group_members"
SET
  "schedule_access" = CASE WHEN "role" = 'viewer' THEN 'view'::"ProjectSectionAccess" ELSE 'edit'::"ProjectSectionAccess" END,
  "resources_access" = CASE WHEN "role" = 'viewer' THEN 'view'::"ProjectSectionAccess" ELSE 'edit'::"ProjectSectionAccess" END,
  "finance_access" = CASE WHEN "role" = 'viewer' THEN 'view'::"ProjectSectionAccess" ELSE 'edit'::"ProjectSectionAccess" END;

ALTER TABLE "project_group_members"
ALTER COLUMN "schedule_access" SET NOT NULL,
ALTER COLUMN "schedule_access" SET DEFAULT 'edit',
ALTER COLUMN "resources_access" SET NOT NULL,
ALTER COLUMN "resources_access" SET DEFAULT 'edit',
ALTER COLUMN "finance_access" SET NOT NULL,
ALTER COLUMN "finance_access" SET DEFAULT 'edit';

ALTER TABLE "project_group_invites"
ADD COLUMN "schedule_access" "ProjectSectionAccess",
ADD COLUMN "resources_access" "ProjectSectionAccess",
ADD COLUMN "finance_access" "ProjectSectionAccess";

UPDATE "project_group_invites"
SET
  "schedule_access" = CASE WHEN "role" = 'viewer' THEN 'view'::"ProjectSectionAccess" ELSE 'edit'::"ProjectSectionAccess" END,
  "resources_access" = CASE WHEN "role" = 'viewer' THEN 'view'::"ProjectSectionAccess" ELSE 'edit'::"ProjectSectionAccess" END,
  "finance_access" = CASE WHEN "role" = 'viewer' THEN 'view'::"ProjectSectionAccess" ELSE 'edit'::"ProjectSectionAccess" END;

ALTER TABLE "project_group_invites"
ALTER COLUMN "schedule_access" SET NOT NULL,
ALTER COLUMN "schedule_access" SET DEFAULT 'edit',
ALTER COLUMN "resources_access" SET NOT NULL,
ALTER COLUMN "resources_access" SET DEFAULT 'edit',
ALTER COLUMN "finance_access" SET NOT NULL,
ALTER COLUMN "finance_access" SET DEFAULT 'edit';
