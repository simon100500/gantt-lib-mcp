ALTER TABLE "tasks"
ADD COLUMN "display_order" INTEGER NOT NULL DEFAULT 0;

WITH ordered_tasks AS (
  SELECT
    id,
    ROW_NUMBER() OVER (PARTITION BY project_id ORDER BY id) - 1 AS row_order
  FROM "tasks"
)
UPDATE "tasks" AS t
SET "display_order" = ordered_tasks.row_order
FROM ordered_tasks
WHERE t.id = ordered_tasks.id;

CREATE INDEX "tasks_project_id_display_order_idx"
ON "tasks"("project_id", "display_order");
