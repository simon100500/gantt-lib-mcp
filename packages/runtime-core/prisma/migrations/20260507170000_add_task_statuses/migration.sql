-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('not_started', 'in_progress', 'done', 'closed');

-- AlterTable
ALTER TABLE "tasks"
ADD COLUMN "status" "TaskStatus" NOT NULL DEFAULT 'not_started';
