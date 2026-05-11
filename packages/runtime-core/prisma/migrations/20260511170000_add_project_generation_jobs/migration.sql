CREATE TYPE "ProjectGenerationJobStatus" AS ENUM ('queued', 'running', 'succeeded', 'failed', 'canceled');
CREATE TYPE "ProjectGenerationJobStage" AS ENUM ('queued', 'interpreting', 'planning', 'compiling', 'committing', 'finalizing', 'succeeded', 'failed');
CREATE TYPE "ProjectGenerationPreviewMode" AS ENUM ('none', 'ephemeral', 'persisted');

CREATE TABLE "project_generation_jobs" (
    "id" TEXT NOT NULL,
    "project_id" TEXT,
    "intent_id" TEXT,
    "user_id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" "ProjectGenerationJobStatus" NOT NULL DEFAULT 'queued',
    "stage" "ProjectGenerationJobStage" NOT NULL DEFAULT 'queued',
    "status_message" TEXT,
    "request_context_id" TEXT,
    "history_group_id" TEXT,
    "progress_percent" INTEGER,
    "preview_mode" "ProjectGenerationPreviewMode" NOT NULL DEFAULT 'none',
    "preview_available" BOOLEAN NOT NULL DEFAULT false,
    "error_code" TEXT,
    "error_message" TEXT,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_generation_jobs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "project_generation_jobs_project_id_created_at_idx" ON "project_generation_jobs"("project_id", "created_at" DESC);
CREATE INDEX "project_generation_jobs_intent_id_created_at_idx" ON "project_generation_jobs"("intent_id", "created_at" DESC);
CREATE INDEX "project_generation_jobs_user_id_created_at_idx" ON "project_generation_jobs"("user_id", "created_at" DESC);
CREATE INDEX "project_generation_jobs_status_created_at_idx" ON "project_generation_jobs"("status", "created_at" DESC);
CREATE INDEX "project_generation_jobs_project_id_status_created_at_idx" ON "project_generation_jobs"("project_id", "status", "created_at" DESC);

ALTER TABLE "project_generation_jobs"
ADD CONSTRAINT "project_generation_jobs_project_id_fkey"
FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "project_generation_jobs"
ADD CONSTRAINT "project_generation_jobs_intent_id_fkey"
FOREIGN KEY ("intent_id") REFERENCES "project_creation_intents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "project_generation_jobs"
ADD CONSTRAINT "project_generation_jobs_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
