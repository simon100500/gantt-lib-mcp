-- CreateTable
CREATE TABLE "agent_session_states" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "session_key" TEXT NOT NULL DEFAULT 'project-chat',
    "messages_snapshot" JSONB NOT NULL,
    "rolling_summary" TEXT,
    "open_threads" JSONB,
    "last_request_context_id" TEXT,
    "compaction_version" INTEGER NOT NULL DEFAULT 1,
    "schema_version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_session_states_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "agent_session_states_project_id_key" ON "agent_session_states"("project_id");

-- CreateIndex
CREATE INDEX "agent_session_states_updated_at_idx" ON "agent_session_states"("updated_at");

-- AddForeignKey
ALTER TABLE "agent_session_states" ADD CONSTRAINT "agent_session_states_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
