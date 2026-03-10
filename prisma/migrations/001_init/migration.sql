-- CreateEnum
CREATE TYPE "public"."DependencyType" AS ENUM ('FS', 'SS', 'FF', 'SF');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "created_at" TEXT NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TEXT NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "access_token" TEXT NOT NULL,
    "refresh_token" TEXT NOT NULL,
    "expires_at" TEXT NOT NULL,
    "created_at" TEXT NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "otp_codes" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "expires_at" TEXT NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "otp_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" TEXT NOT NULL,
    "project_id" TEXT,
    "name" TEXT NOT NULL,
    "start_date" TEXT NOT NULL,
    "end_date" TEXT NOT NULL,
    "color" TEXT,
    "progress" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dependencies" (
    "id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "dep_task_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "lag" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "dependencies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "project_id" TEXT,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TEXT NOT NULL,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_access_token_key" ON "sessions"("access_token");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_refresh_token_key" ON "sessions"("refresh_token");

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dependencies" ADD CONSTRAINT "dependencies_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- PostgreSQL NOTIFY/LISTEN trigger function for task changes
CREATE OR REPLACE FUNCTION notify_task_change()
RETURNS trigger AS $$
BEGIN
  PERFORM pg_notify(
    'tasks_channel',
    json_build_object(
      'action', TG_OP,
      'project_id', COALESCE(NEW.project_id, OLD.project_id),
      'task_id', COALESCE(NEW.id, OLD.id),
      'task', CASE
        WHEN TG_OP = 'DELETE' THEN row_to_json(OLD)
        ELSE row_to_json(NEW)
      END
    )::text
  );
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Create triggers on tasks table
DROP TRIGGER IF EXISTS tasks_notify_insert ON "tasks";
CREATE TRIGGER tasks_notify_insert
  AFTER INSERT ON "tasks"
  FOR EACH ROW
  EXECUTE FUNCTION notify_task_change();

DROP TRIGGER IF EXISTS tasks_notify_update ON "tasks";
CREATE TRIGGER tasks_notify_update
  AFTER UPDATE ON "tasks"
  FOR EACH ROW
  EXECUTE FUNCTION notify_task_change();

DROP TRIGGER IF EXISTS tasks_notify_delete ON "tasks";
CREATE TRIGGER tasks_notify_delete
  AFTER DELETE ON "tasks"
  FOR EACH ROW
  EXECUTE FUNCTION notify_task_change();

-- Create triggers on dependencies table (affects tasks indirectly)
CREATE OR REPLACE FUNCTION notify_dependency_change()
RETURNS trigger AS $$
BEGIN
  -- For dependency changes, notify with the associated task_id
  PERFORM pg_notify(
    'tasks_channel',
    json_build_object(
      'action', TG_OP,
      'project_id', NULL,
      'task_id', COALESCE(NEW.task_id, OLD.task_id),
      'dependency', CASE
        WHEN TG_OP = 'DELETE' THEN row_to_json(OLD)
        ELSE row_to_json(NEW)
      END
    )::text
  );
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS dependencies_notify_insert ON "dependencies";
CREATE TRIGGER dependencies_notify_insert
  AFTER INSERT ON "dependencies"
  FOR EACH ROW
  EXECUTE FUNCTION notify_dependency_change();

DROP TRIGGER IF EXISTS dependencies_notify_update ON "dependencies";
CREATE TRIGGER dependencies_notify_update
  AFTER UPDATE ON "dependencies"
  FOR EACH ROW
  EXECUTE FUNCTION notify_dependency_change();

DROP TRIGGER IF EXISTS dependencies_notify_delete ON "dependencies";
CREATE TRIGGER dependencies_notify_delete
  AFTER DELETE ON "dependencies"
  FOR EACH ROW
  EXECUTE FUNCTION notify_dependency_change();
