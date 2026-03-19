/**
 * Script to clean up orphaned dependencies from the database
 * Orphaned dependencies are those where depTaskId references a non-existent task
 */

import { config as dotenvConfig } from 'dotenv';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Load .env before importing anything else
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenvConfig({ path: resolve(__dirname, '../../../.env') });

import { getPrisma } from '../src/prisma.js';

async function cleanupOrphanedDependencies(): Promise<void> {
  const prisma = getPrisma();

  console.log('Checking for orphaned dependencies...');

  // Find all dependencies
  const allDeps = await prisma.dependency.findMany({
    select: { id: true, depTaskId: true, taskId: true },
  });

  if (allDeps.length === 0) {
    console.log('No dependencies found in database.');
    return;
  }

  console.log(`Total dependencies: ${allDeps.length}`);

  // Get all depTaskIds
  const depTaskIds = [...new Set(allDeps.map(d => d.depTaskId))];

  // Find existing tasks
  const existingTasks = await prisma.task.findMany({
    where: { id: { in: depTaskIds } },
    select: { id: true },
  });

  const existingIds = new Set(existingTasks.map(t => t.id));

  // Find orphaned dependencies
  const orphaned = allDeps.filter(d => !existingIds.has(d.depTaskId));

  if (orphaned.length === 0) {
    console.log('✓ No orphaned dependencies found.');
    return;
  }

  console.log(`Found ${orphaned.length} orphaned dependencies:`);
  orphaned.forEach(d => {
    console.log(`  - Dependency ${d.id}: task ${d.taskId} -> non-existent task ${d.depTaskId}`);
  });

  // Delete orphaned dependencies
  const orphanedIds = orphaned.map(d => d.id);
  const result = await prisma.dependency.deleteMany({
    where: { id: { in: orphanedIds } },
  });

  console.log(`✓ Cleaned up ${result.count} orphaned dependencies.`);
}

cleanupOrphanedDependencies()
  .then(() => {
    console.log('Done.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });
