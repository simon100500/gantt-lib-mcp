import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '..', '..');

function readFile(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

test('runtime-core service barrel exports authoritative services', () => {
  const source = readFile('packages/runtime-core/src/services/index.ts');

  assert.match(source, /commandService/);
  assert.match(source, /historyService/);
  assert.match(source, /taskService/);
  assert.match(source, /projectService/);
  assert.match(source, /messageService/);
  assert.match(source, /enforcementService/);
});

test('mcp entrypoints are compatibility re-exports into runtime-core', () => {
  const servicesSource = readFile('packages/mcp/src/services/index.ts');
  const typesSource = readFile('packages/mcp/src/types.ts');
  const prismaSource = readFile('packages/mcp/src/prisma.ts');

  assert.match(servicesSource, /@gantt\/runtime-core\/services/);
  assert.match(typesSource, /@gantt\/runtime-core\/types/);
  assert.match(prismaSource, /@gantt\/runtime-core\/prisma/);
});
