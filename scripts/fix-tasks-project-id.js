import { createClient } from '@libsql/client';

const db = createClient({ url: 'file:./gantt.db' });

console.log('=== BEFORE FIX ===');
const beforeResult = await db.execute('SELECT id, project_id, name FROM tasks');
console.log('Total tasks:', beforeResult.rows.length);

const byProjectBefore = {};
for (const row of beforeResult.rows) {
  const pid = row['project_id'] || 'NULL';
  if (!byProjectBefore[pid]) byProjectBefore[pid] = [];
  byProjectBefore[pid].push({ id: row['id'], name: row['name'] });
}

console.log('\nTasks by project_id (BEFORE):');
for (const [pid, tasks] of Object.entries(byProjectBefore)) {
  console.log(`  project_id=${pid}: ${tasks.length} tasks`);
}

// Delete all tasks with project_id=NULL
console.log('\n=== DELETING TASKS WITH project_id=NULL ===');
const deleteResult = await db.execute('DELETE FROM tasks WHERE project_id IS NULL');
console.log('Deleted tasks:', deleteResult.rowsAffected ?? 0);

console.log('\n=== AFTER FIX ===');
const afterResult = await db.execute('SELECT id, project_id, name FROM tasks');
console.log('Total tasks remaining:', afterResult.rows.length);

if (afterResult.rows.length > 0) {
  const byProjectAfter = {};
  for (const row of afterResult.rows) {
    const pid = row['project_id'] || 'NULL';
    if (!byProjectAfter[pid]) byProjectAfter[pid] = [];
    byProjectAfter[pid].push({ id: row['id'], name: row['name'] });
  }

  console.log('\nTasks by project_id (AFTER):');
  for (const [pid, tasks] of Object.entries(byProjectAfter)) {
    console.log(`  project_id=${pid}: ${tasks.length} tasks`);
  }
} else {
  console.log('No tasks remaining - clean slate!');
}

process.exit(0);
