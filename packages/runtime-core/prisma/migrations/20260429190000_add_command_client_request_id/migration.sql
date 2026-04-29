-- Add idempotency key for command commits.
ALTER TABLE "project_events"
ADD COLUMN "client_request_id" TEXT;

CREATE UNIQUE INDEX "project_events_project_id_client_request_id_key"
ON "project_events"("project_id", "client_request_id");
