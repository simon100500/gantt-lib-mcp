CREATE TYPE "TaskType" AS ENUM ('task', 'milestone');

ALTER TABLE "tasks"
ADD COLUMN "type" "TaskType" NOT NULL DEFAULT 'task';
