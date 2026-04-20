-- CreateEnum
CREATE TYPE "ActorType" AS ENUM ('user', 'agent', 'system', 'import_actor');

-- AlterTable
ALTER TABLE "projects"
ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "project_events" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "base_version" INTEGER NOT NULL,
    "version" INTEGER NOT NULL,
    "applied" BOOLEAN NOT NULL DEFAULT true,
    "actor_type" "ActorType" NOT NULL,
    "actor_id" TEXT,
    "core_version" TEXT NOT NULL,
    "command" JSONB NOT NULL,
    "result" JSONB NOT NULL,
    "patches" JSONB NOT NULL,
    "execution_time_ms" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "project_events_project_id_idx" ON "project_events"("project_id");

-- CreateIndex
CREATE INDEX "project_events_project_id_version_idx" ON "project_events"("project_id", "version");

-- AddForeignKey
ALTER TABLE "project_events" ADD CONSTRAINT "project_events_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
