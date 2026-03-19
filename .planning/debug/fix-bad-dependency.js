import { config } from 'dotenv';
import { getPrisma } from '../../packages/mcp/dist/prisma.js';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const envPath = resolve(__dirname, '../..', '.env');
config({ path: envPath });

const prisma = getPrisma();

async function main() {
  const projectId = '0a65c71b-1b6c-4533-a5ce-7c0351c2c733';

  // Find the bad dependency
  const badDependencies = await prisma.dependency.findMany({
    where: {
      depTaskId: 'c3fb6d98-712f-4d80-85ae-3a08e5e4ab1e'
    }
  });

  console.log('Found bad dependencies:', badDependencies.length);
  console.log('Details:', badDependencies);

  if (badDependencies.length > 0) {
    // Delete the bad dependency
    const result = await prisma.dependency.deleteMany({
      where: {
        depTaskId: 'c3fb6d98-712f-4d80-85ae-3a08e5e4ab1e'
      }
    });

    console.log('\nDeleted bad dependencies:', result.count);

    // Also update the task to remove the dependency from its dependencies array
    const task = await prisma.task.findUnique({
      where: { id: 'ae0d6ceb-3cc9-49eb-8c1f-09f379e96b1b' }
    });

    if (task && task.dependencies) {
      const updatedDependencies = task.dependencies.filter(
        dep => dep.taskId !== 'c3fb6d98-712f-4d80-85ae-3a08e5e4ab1e'
      );

      await prisma.task.update({
        where: { id: 'ae0d6ceb-3cc9-49eb-8c1f-09f379e96b1b' },
        data: { dependencies: updatedDependencies }
      });

      console.log('Updated task dependencies');
    }
  }

  console.log('\nDone! The validation error should be resolved.');
}

main().catch(console.error).finally(() => prisma.$disconnect());
