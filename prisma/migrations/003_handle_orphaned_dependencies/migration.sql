-- Fix notify_dependency_change() to handle orphaned dependencies gracefully
--
-- Problem: When a dependency is deleted AFTER its task is deleted, the trigger
-- query (SELECT project_id FROM tasks WHERE id = task_id) returns NULL because
-- the task no longer exists. This causes pg-listener to log warnings and skip
-- the notification.
--
-- Solution: Check if the task exists before sending notification. If the task
-- doesn't exist, skip the notification (it's likely a cascade delete where
-- the task deletion already triggered a notification).

-- Drop the old trigger function
DROP FUNCTION IF EXISTS notify_dependency_change() CASCADE;

-- Create the improved trigger function with orphan check
CREATE OR REPLACE FUNCTION notify_dependency_change()
RETURNS trigger AS $$
DECLARE
  v_task_id TEXT;
  v_project_id TEXT;
BEGIN
  -- Get the task_id from the dependency row
  v_task_id := COALESCE(NEW.task_id, OLD.task_id);

  -- Only proceed if we have a task_id
  IF v_task_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Check if the task still exists and get its project_id
  SELECT project_id INTO v_project_id
  FROM tasks
  WHERE id = v_task_id;

  -- If task doesn't exist, skip notification (likely already deleted)
  IF v_project_id IS NULL THEN
    RAISE LOG 'Dependency notification skipped: task % no longer exists (operation: %)', v_task_id, TG_OP;
    RETURN NULL;
  END IF;

  -- Send notification with project_id
  PERFORM pg_notify(
    'tasks_channel',
    json_build_object(
      'action', TG_OP,
      'project_id', v_project_id,
      'task_id', v_task_id,
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
