ALTER TABLE "messages"
ADD COLUMN "request_context_id" TEXT,
ADD COLUMN "history_group_id" TEXT,
ADD COLUMN "deleted_at" TIMESTAMP(3);

CREATE INDEX "messages_project_id_created_at_idx" ON "messages"("project_id", "created_at");
CREATE INDEX "messages_project_id_request_context_id_idx" ON "messages"("project_id", "request_context_id");
CREATE INDEX "messages_project_id_history_group_id_idx" ON "messages"("project_id", "history_group_id");
CREATE INDEX "messages_project_id_deleted_at_idx" ON "messages"("project_id", "deleted_at");
