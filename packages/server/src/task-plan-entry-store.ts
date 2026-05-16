type TaskPlanEntryRow = {
  id: string;
  projectId: string;
  taskId: string;
  entryDate: Date;
  amount: number;
  createdAt: Date;
  updatedAt: Date;
};

type SqlClient = {
  $queryRaw<T = unknown>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
  $executeRaw(query: TemplateStringsArray, ...values: unknown[]): Promise<unknown>;
};

export async function listTaskPlanEntries(db: SqlClient, projectId: string, taskId?: string): Promise<TaskPlanEntryRow[]> {
  if (taskId) {
    return db.$queryRaw<TaskPlanEntryRow[]>`
      SELECT
        id,
        project_id AS "projectId",
        task_id AS "taskId",
        entry_date AS "entryDate",
        amount,
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM task_plan_entries
      WHERE project_id = ${projectId} AND task_id = ${taskId}
      ORDER BY task_id ASC, entry_date ASC, created_at ASC
    `;
  }

  return db.$queryRaw<TaskPlanEntryRow[]>`
    SELECT
      id,
      project_id AS "projectId",
      task_id AS "taskId",
      entry_date AS "entryDate",
      amount,
      created_at AS "createdAt",
      updated_at AS "updatedAt"
    FROM task_plan_entries
    WHERE project_id = ${projectId}
    ORDER BY task_id ASC, entry_date ASC, created_at ASC
  `;
}

export async function deleteTaskPlanEntriesForTask(db: SqlClient, projectId: string, taskId: string): Promise<void> {
  await db.$executeRaw`
    DELETE FROM task_plan_entries
    WHERE project_id = ${projectId} AND task_id = ${taskId}
  `;
}

export async function insertTaskPlanEntries(
  db: SqlClient,
  entries: Array<{ id: string; projectId: string; taskId: string; entryDate: Date; amount: number; createdAt?: Date; updatedAt?: Date }>,
): Promise<void> {
  for (const entry of entries) {
    await db.$executeRaw`
      INSERT INTO task_plan_entries (id, project_id, task_id, entry_date, amount, created_at, updated_at)
      VALUES (
        ${entry.id},
        ${entry.projectId},
        ${entry.taskId},
        ${entry.entryDate},
        ${entry.amount},
        ${entry.createdAt ?? new Date()},
        ${entry.updatedAt ?? new Date()}
      )
    `;
  }
}
