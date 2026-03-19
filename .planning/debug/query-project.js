import { config } from 'dotenv';
import { getPrisma } from '../../packages/mcp/dist/prisma.js';
import { pathToFileURL } from 'url';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env from root directory
const envPath = resolve(__dirname, '../..', '.env');
console.log('Loading .env from:', envPath);
config({ path: envPath });

console.log('DATABASE_URL set?', !!process.env.DATABASE_URL);

const prisma = getPrisma();

const projectId = '0a65c71b-1b6c-4533-a5ce-7c0351c2c733';

try {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, name: true, userId: true }
  });

  console.log('Project:', JSON.stringify(project, null, 2));

  if (!project) {
    console.log('Project not found!');
    process.exit(1);
  }

  const tasks = await prisma.task.findMany({
    where: { projectId },
    select: { id: true, name: true, startDate: true, endDate: true, parentId: true }
  });

  console.log('\nTasks count:', tasks.length);
  tasks.forEach(t => console.log('  -', t.id, t.name, t.startDate, 'to', t.endDate, 'parent:', t.parentId));

  const dependencies = await prisma.dependency.findMany({
    where: { taskId: { in: tasks.map(t => t.id) } }
  });

  console.log('\nDependencies count:', dependencies.length);
  dependencies.forEach(d => console.log('  -', d.taskId, 'depends on', d.depTaskId, 'type:', d.type));

  // Check for circular dependencies
  console.log('\n\n=== Checking for circular dependencies ===');
  const taskMap = new Map(tasks.map(t => [t.id, t]));
  const visited = new Set();
  const recStack = new Set();

  function checkCycle(taskId, path = []) {
    if (recStack.has(taskId)) {
      const cyclePath = [...path, taskId];
      console.log('  CIRCULAR DEPENDENCY DETECTED:', cyclePath.join(' -> '));
      return true;
    }
    if (visited.has(taskId)) {
      return false;
    }

    visited.add(taskId);
    recStack.add(taskId);

    const deps = dependencies.filter(d => d.taskId === taskId);
    for (const dep of deps) {
      if (dep.depTaskId && taskMap.has(dep.depTaskId)) {
        if (checkCycle(dep.depTaskId, [...path, taskId])) {
          return true;
        }
      }
    }

    recStack.delete(taskId);
    return false;
  }

  for (const task of tasks) {
    if (!visited.has(task.id)) {
      checkCycle(task.id);
    }
  }

  if (visited.size === tasks.length) {
    console.log('  No circular dependencies found');
  }

  // Check for missing tasks in dependencies
  console.log('\n=== Checking for missing task references ===');
  const allTaskIds = new Set(tasks.map(t => t.id));
  let missingFound = false;
  for (const dep of dependencies) {
    if (!allTaskIds.has(dep.depTaskId)) {
      console.log('  MISSING TASK:', dep.depTaskId, 'referenced by', dep.taskId);
      missingFound = true;
    }
  }
  if (!missingFound) {
    console.log('  All dependency references are valid');
  }

} catch (error) {
  console.error('Error:', error);
} finally {
  await prisma.$disconnect();
}
