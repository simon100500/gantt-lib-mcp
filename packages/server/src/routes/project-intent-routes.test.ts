import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = dirname(fileURLToPath(import.meta.url));
const indexSource = readFileSync(resolve(currentDir, '../index.ts'), 'utf8');

describe('project intent routes registration', () => {
  it('registers project intent routes in server startup', () => {
    assert.match(indexSource, /import \{ registerProjectIntentRoutes \} from '\.\/routes\/project-intent-routes\.js';/);
    assert.match(indexSource, /await registerProjectIntentRoutes\(fastify\);/);
  });
});
