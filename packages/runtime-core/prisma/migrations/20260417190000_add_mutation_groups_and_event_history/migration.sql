-- CreateEnum
CREATE TYPE "MutationGroupOrigin" AS ENUM ('user_ui', 'agent_run', 'system', 'undo', 'redo');

-- CreateEnum
CREATE TYPE "MutationGroupStatus" AS ENUM ('applied', 'undone');

-- CreateTable
CREATE TABLE "mutation_groups" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "base_version" INTEGER NOT NULL,
    "new_version" INTEGER,
    "actor_type" "ActorType" NOT NULL,
    "actor_id" TEXT,
    "origin" "MutationGroupOrigin" NOT NULL,
    "title" TEXT NOT NULL,
    "status" "MutationGroupStatus" NOT NULL DEFAULT 'applied',
    "undoable" BOOLEAN NOT NULL DEFAULT false,
    "undone_by_group_id" TEXT,
    "redo_of_group_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mutation_groups_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "project_events"
ADD COLUMN "group_id" TEXT,
ADD COLUMN "ordinal" INTEGER,
ADD COLUMN "inverse_command" JSONB,
ADD COLUMN "metadata" JSONB,
ADD COLUMN "request_context_id" TEXT;

-- CreateIndex
CREATE INDEX "mutation_groups_project_id_created_at_idx" ON "mutation_groups"("project_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "mutation_groups_project_id_new_version_idx" ON "mutation_groups"("project_id", "new_version" DESC);

-- CreateIndex
CREATE INDEX "project_events_group_id_ordinal_idx" ON "project_events"("group_id", "ordinal");

-- CreateIndex
CREATE INDEX "project_events_request_context_id_idx" ON "project_events"("request_context_id");

-- AddForeignKey
ALTER TABLE "mutation_groups" ADD CONSTRAINT "mutation_groups_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_events" ADD CONSTRAINT "project_events_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "mutation_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;
