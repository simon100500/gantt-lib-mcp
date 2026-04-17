CREATE TABLE "agent_debug_logs" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "user_id" TEXT,
    "project_id" TEXT,
    "session_id" TEXT,
    "run_id" TEXT,
    "attempt" INTEGER,
    "tool" TEXT,
    "tool_use_id" TEXT,
    "ai_mutation_source" TEXT,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_debug_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "agent_debug_logs_created_at_idx" ON "agent_debug_logs"("created_at");
CREATE INDEX "agent_debug_logs_source_created_at_idx" ON "agent_debug_logs"("source", "created_at");
CREATE INDEX "agent_debug_logs_event_created_at_idx" ON "agent_debug_logs"("event", "created_at");
CREATE INDEX "agent_debug_logs_user_id_created_at_idx" ON "agent_debug_logs"("user_id", "created_at");
CREATE INDEX "agent_debug_logs_project_id_created_at_idx" ON "agent_debug_logs"("project_id", "created_at");
CREATE INDEX "agent_debug_logs_session_id_created_at_idx" ON "agent_debug_logs"("session_id", "created_at");
CREATE INDEX "agent_debug_logs_run_id_attempt_created_at_idx" ON "agent_debug_logs"("run_id", "attempt", "created_at");
CREATE INDEX "agent_debug_logs_tool_created_at_idx" ON "agent_debug_logs"("tool", "created_at");

ALTER TABLE "agent_debug_logs"
ADD CONSTRAINT "agent_debug_logs_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "agent_debug_logs"
ADD CONSTRAINT "agent_debug_logs_project_id_fkey"
FOREIGN KEY ("project_id") REFERENCES "projects"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "agent_debug_logs"
ADD CONSTRAINT "agent_debug_logs_session_id_fkey"
FOREIGN KEY ("session_id") REFERENCES "sessions"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
