ALTER TABLE "project_creation_intents"
ADD COLUMN "project_id" TEXT,
ADD COLUMN "request_context_id" TEXT,
ADD COLUMN "history_group_id" TEXT;

CREATE INDEX "project_creation_intents_project_id_idx" ON "project_creation_intents"("project_id");
