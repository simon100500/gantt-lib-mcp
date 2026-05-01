DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ShareLinkScope') THEN
    CREATE TYPE "ShareLinkScope" AS ENUM ('project', 'task_selection');
  END IF;
END $$;

ALTER TABLE "share_links"
ADD COLUMN "label" TEXT NOT NULL DEFAULT '',
ADD COLUMN "scope" "ShareLinkScope" NOT NULL DEFAULT 'project',
ADD COLUMN "included_task_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "revoked_at" TIMESTAMP(3);

CREATE INDEX "share_links_project_id_revoked_at_idx" ON "share_links"("project_id", "revoked_at");
