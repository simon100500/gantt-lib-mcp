import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';

const authRoutesSource = readFileSync(resolve(process.cwd(), 'packages/server/src/routes/auth-routes.ts'), 'utf8');

describe('auth project route enforcement', () => {
  it('guards project creation with the projects limit before createProject runs', () => {
    assert.match(
      authRoutesSource,
      /fastify\.post\('\/api\/projects',\s*\{\s*preHandler:\s*\[authMiddleware,\s*requireProjectLimit\]\s*\},\s*async \(req, reply\) => \{[\s\S]*authService\.createProject\(req\.user!\.userId, name\.trim\(\)\)/,
    );
  });

  it('guards project restore with the projects limit before restoreProject runs', () => {
    assert.match(
      authRoutesSource,
      /fastify\.post<\{ Params: \{ id: string \} \}>\('\/api\/projects\/:id\/restore',\s*\{\s*preHandler:\s*\[authMiddleware,\s*requireProjectLimit\]\s*\},\s*async \(req, reply\) => \{[\s\S]*authService\.restoreProject\(projectId, req\.user!\.userId\)/,
    );
  });

  it('does not apply the projects guard to archive or delete flows', () => {
    assert.doesNotMatch(
      authRoutesSource,
      /fastify\.post<\{ Params: \{ id: string \} \}>\('\/api\/projects\/:id\/archive',\s*\{\s*preHandler:\s*\[authMiddleware,\s*requireProjectLimit\]/,
    );
    assert.doesNotMatch(
      authRoutesSource,
      /fastify\.delete<\{ Params: \{ id: string \} \}>\('\/api\/projects\/:id',\s*\{\s*preHandler:\s*\[authMiddleware,\s*requireProjectLimit\]/,
    );
  });
});

describe('archive route feature gate enforcement', () => {
  it('composes authMiddleware then requireArchiveAccess before archiveProject', () => {
    assert.match(
      authRoutesSource,
      /fastify\.post<\{ Params: \{ id: string \} \}>\('\/api\/projects\/:id\/archive',\s*\{\s*preHandler:\s*\[authMiddleware,\s*requireArchiveAccess\]\s*\},\s*async \(req, reply\) => \{[\s\S]*authService\.archiveProject\(projectId, req\.user!\.userId\)/,
    );
  });

  it('defines requireArchiveAccess using requireFeatureGate with archive limit key', () => {
    assert.match(
      authRoutesSource,
      /const requireArchiveAccess\s*=\s*requireFeatureGate\('archive'/,
    );
  });

  it('does not guard delete route with requireArchiveAccess or requireProjectLimit', () => {
    assert.doesNotMatch(
      authRoutesSource,
      /fastify\.delete<\{ Params: \{ id: string \} \}>\('\/api\/projects\/:id',\s*\{\s*preHandler:\s*\[authMiddleware,\s*requireArchiveAccess\]/,
    );
    assert.doesNotMatch(
      authRoutesSource,
      /fastify\.delete<\{ Params: \{ id: string \} \}>\('\/api\/projects\/:id',\s*\{\s*preHandler:\s*\[authMiddleware,\s*requireProjectLimit\]/,
    );
  });
});
