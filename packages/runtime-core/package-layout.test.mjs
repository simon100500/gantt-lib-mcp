import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '..', '..');

function readFile(relativePath) {
  const fullPath = path.join(repoRoot, relativePath);
  return fs.readFileSync(fullPath, 'utf8');
}

function readJson(relativePath) {
  return JSON.parse(readFile(relativePath));
}

test('runtime-core package exists with explicit exports', () => {
  const pkg = readJson('packages/runtime-core/package.json');

  assert.equal(pkg.name, '@gantt/runtime-core');
  assert.equal(pkg.exports['.'], './dist/index.js');
  assert.equal(pkg.exports['./types'], './dist/types.js');
  assert.equal(pkg.exports['./prisma'], './dist/prisma.js');
  assert.equal(pkg.exports['./services'], './dist/services/index.js');
});

test('runtime-core sources expose shared types and prisma bootstrap', () => {
  const typesSource = readFile('packages/runtime-core/src/types.ts');
  const prismaSource = readFile('packages/runtime-core/src/prisma.ts');

  assert.match(typesSource, /export type ProjectCommand/);
  assert.match(typesSource, /export interface NormalizedMutationResult/);
  assert.match(prismaSource, /export function getPrisma|export const getPrisma/);
});

test('server and mcp packages declare a direct runtime-core dependency', () => {
  const serverPkg = readJson('packages/server/package.json');
  const mcpPkg = readJson('packages/mcp/package.json');

  assert.equal(serverPkg.dependencies['@gantt/runtime-core'], '^0.1.0');
  assert.equal(mcpPkg.dependencies['@gantt/runtime-core'], '^0.1.0');
});
