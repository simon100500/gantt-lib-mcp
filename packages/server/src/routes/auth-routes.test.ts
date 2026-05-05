import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';

const authRoutesSource = readFileSync(resolve(process.cwd(), 'packages/server/src/routes/auth-routes.ts'), 'utf8');

describe('auth project route enforcement', () => {
  it('guards project creation with the projects limit before createProject runs', () => {
    assert.match(
      authRoutesSource,
      /fastify\.post\('\/api\/projects',\s*\{\s*preHandler:\s*\[authMiddleware,\s*requireProjectLimit\]\s*\},\s*async \(req, reply\) => \{[\s\S]*resolveGroupAccess\(req\.user!\.userId, groupId\)[\s\S]*authService\.createProject\(groupAccess\.ownerUserId, name\.trim\(\), groupId\)/,
    );
  });

  it('guards project restore with the projects limit before restoreProject runs', () => {
    assert.match(
      authRoutesSource,
      /fastify\.post<\{ Params: \{ id: string \} \}>\('\/api\/projects\/:id\/restore',\s*\{\s*preHandler:\s*\[authMiddleware,\s*requireProjectLimit\]\s*\},\s*async \(req, reply\) => \{[\s\S]*resolveProjectAccess\(req\.user!\.userId, projectId\)[\s\S]*authService\.restoreProject\(projectId, access\.ownerUserId\)/,
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

describe('archive and delete route enforcement', () => {
  it('guards archive only with authMiddleware before archiveProject', () => {
    assert.match(
      authRoutesSource,
      /fastify\.post<\{ Params: \{ id: string \} \}>\('\/api\/projects\/:id\/archive',\s*\{\s*preHandler:\s*\[authMiddleware\]\s*\},\s*async \(req, reply\) => \{[\s\S]*resolveProjectAccess\(req\.user!\.userId, projectId\)[\s\S]*authService\.archiveProject\(projectId, access\.ownerUserId\)/,
    );
  });

  it('does not guard archive or delete routes with project or archive-specific billing limits', () => {
    assert.doesNotMatch(
      authRoutesSource,
      /fastify\.post<\{ Params: \{ id: string \} \}>\('\/api\/projects\/:id\/archive',\s*\{\s*preHandler:\s*\[authMiddleware,\s*requireProjectLimit\]/,
    );
    assert.doesNotMatch(
      authRoutesSource,
      /fastify\.post<\{ Params: \{ id: string \} \}>\('\/api\/projects\/:id\/archive',\s*\{\s*preHandler:\s*\[authMiddleware,\s*requireArchiveAccess\]/,
    );
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
