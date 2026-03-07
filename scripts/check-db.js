import { createClient } from '@libsql/client';

const db = createClient({ url: 'file:./gantt.db' });

console.log('=== TASKS ===');
const tasksResult = await db.execute('SELECT id, project_id, name FROM tasks');
console.log('Total tasks:', tasksResult.rows.length);

// Group by project_id
const byProject = {};
for (const row of tasksResult.rows) {
  const pid = row['project_id'] || 'NULL';
  if (!byProject[pid]) byProject[pid] = [];
  byProject[pid].push({ id: row['id'], name: row['name'] });
}

console.log('\nTasks by project_id:');
for (const [pid, tasks] of Object.entries(byProject)) {
  console.log(`  project_id=${pid}: ${tasks.length} tasks`);
}

console.log('\n=== PROJECTS ===');
const projectsResult = await db.execute('SELECT id, name FROM projects');
console.log('Total projects:', projectsResult.rows.length);
for (const row of projectsResult.rows) {
  console.log(`  id=${row['id']}, name=${row['name']}`);
}

process.exit(0);
