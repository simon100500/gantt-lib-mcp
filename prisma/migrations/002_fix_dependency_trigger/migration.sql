-- Fix notify_dependency_change() to include project_id in notifications
--
-- Problem: The original trigger function hardcoded project_id to NULL,
-- causing pg-listener to skip dependency notifications since it requires
-- project_id to broadcast SSE updates to the correct project clients.
--
-- Solution: Lookup project_id from the associated task table using the
-- task_id from the dependency row.

-- Drop the old trigger function
DROP FUNCTION IF EXISTS notify_dependency_change() CASCADE;

-- Create the fixed trigger function with project_id lookup
CREATE OR REPLACE FUNCTION notify_dependency_change()
RETURNS trigger AS $$
BEGIN
  -- For dependency changes, notify with the project_id looked up from the task
  PERFORM pg_notify(
    'tasks_channel',
    json_build_object(
      'action', TG_OP,
      'project_id', (SELECT project_id FROM tasks WHERE id = COALESCE(NEW.task_id, OLD.task_id)),
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

-- Recreate triggers on dependencies table
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
