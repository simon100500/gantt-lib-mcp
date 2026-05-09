CREATE TYPE "TemplateGenerationJobStatus" AS ENUM (
  'queued',
  'in_progress',
  'review_required',
  'ready_to_publish',
  'published',
  'failed'
);

CREATE TABLE "template_generation_jobs" (
  "id" TEXT NOT NULL,
  "requested_by_user_id" TEXT NOT NULL,
  "source_project_id" TEXT,
  "publication_id" TEXT,
  "source_description" TEXT NOT NULL,
  "kind" "TemplatePublicationKind" NOT NULL,
  "category" TEXT,
  "industry" TEXT,
  "title" TEXT,
  "slug" TEXT,
  "auto_publish" BOOLEAN NOT NULL DEFAULT false,
  "status" "TemplateGenerationJobStatus" NOT NULL DEFAULT 'queued',
  "seo_title" TEXT,
  "seo_description" TEXT,
  "seo_body" TEXT,
  "error_message" TEXT,
  "last_run_at" TIMESTAMP(3),
  "completed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "template_generation_jobs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "template_generation_jobs_requested_by_user_id_created_at_idx"
ON "template_generation_jobs"("requested_by_user_id", "created_at" DESC);

CREATE INDEX "template_generation_jobs_status_created_at_idx"
ON "template_generation_jobs"("status", "created_at" DESC);

CREATE INDEX "template_generation_jobs_source_project_id_idx"
ON "template_generation_jobs"("source_project_id");

CREATE INDEX "template_generation_jobs_publication_id_idx"
ON "template_generation_jobs"("publication_id");

ALTER TABLE "template_generation_jobs"
ADD CONSTRAINT "template_generation_jobs_requested_by_user_id_fkey"
FOREIGN KEY ("requested_by_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "template_generation_jobs"
ADD CONSTRAINT "template_generation_jobs_source_project_id_fkey"
FOREIGN KEY ("source_project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "template_generation_jobs"
ADD CONSTRAINT "template_generation_jobs_publication_id_fkey"
FOREIGN KEY ("publication_id") REFERENCES "template_publications"("id") ON DELETE SET NULL ON UPDATE CASCADE;
