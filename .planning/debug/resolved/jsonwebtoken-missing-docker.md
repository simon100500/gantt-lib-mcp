---
status: awaiting_human_verify
trigger: "Docker dev container crashes on startup because jsonwebtoken package cannot be found when imported from /app/packages/server/src/auth.ts"
created: 2026-03-05T00:00:00Z
updated: 2026-03-05T01:00:00Z
---

## Current Focus

hypothesis: CONFIRMED. The per-package `npm install` calls in the entrypoint fail with EROFS because /app/package-lock.json is bind-mounted read-only (:ro) in docker-compose.dev.yml. npm install always tries to update the workspace-root lockfile. The root `npm ci` already installs all workspace deps via hoisting - the per-package calls are both redundant and broken.
test: Removed three per-package npm install calls from entrypoint and Dockerfile. Root npm ci is sufficient.
expecting: Container starts cleanly. npm ci installs all deps into root_node_modules volume. Node resolution walks up to /app/node_modules and finds jsonwebtoken.
next_action: User verifies docker-compose up works end-to-end

## Symptoms

expected: Backend server starts successfully on :3000
actual: Server crashes immediately with ERR_MODULE_NOT_FOUND for 'jsonwebtoken'
errors: |
  Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'jsonwebtoken' imported from /app/packages/server/src/auth.ts
  code: 'ERR_MODULE_NOT_FOUND'
reproduction: docker-compose -f docker-compose.dev.yml up
started: After new auth feature was added (auth.ts uses jsonwebtoken)

## Eliminated

- hypothesis: jsonwebtoken is missing from packages/server/package.json
  evidence: packages/server/package.json line 18 explicitly lists "jsonwebtoken": "^9.0.3" in dependencies
  timestamp: 2026-03-05T00:00:00Z

- hypothesis: entrypoint per-package npm install is needed to populate workspace node_modules
  evidence: Root npm ci installs all workspace deps into /app/node_modules via hoisting. Per-package install is redundant. It also fails with EROFS because /app/package-lock.json is :ro in docker-compose.dev.yml.
  timestamp: 2026-03-05T01:00:00Z

## Evidence

- timestamp: 2026-03-05T00:00:00Z
  checked: packages/server/package.json
  found: jsonwebtoken ^9.0.3 is present in dependencies
  implication: The package is declared; installation is the problem, not declaration

- timestamp: 2026-03-05T00:00:00Z
  checked: Dockerfile.dev
  found: npm ci runs at root, then cd /app/packages/server && npm install. But source files are never COPYed into the image - only package.json files are copied.
  implication: The build installs deps into image layers, but docker-compose.dev.yml mounts named volumes over all node_modules dirs AND bind-mounts source dirs over the package dirs, which shadows the image layers entirely.

- timestamp: 2026-03-05T00:00:00Z
  checked: docker-compose.dev.yml volumes section
  found: Four named volumes mount over node_modules directories (root, web, server, mcp). Four bind mounts mount the source packages. On first run, named volumes are EMPTY, so node_modules dirs are empty in the container.
  implication: This is the root cause. The build-time npm install results live in image layers that are completely shadowed by the named volumes. On first docker-compose up, named volumes are initialized but empty, so no node_modules exist at runtime.

- timestamp: 2026-03-05T01:00:00Z
  checked: docker-compose.dev.yml line 15 and entrypoint EROFS error
  found: /app/package-lock.json is bind-mounted :ro. npm install (in any workspace subdirectory) always rewrites the workspace-root package-lock.json. This triggers EROFS errno -30 and exits code 226.
  implication: Per-package npm install is both unnecessary (root npm ci covers all deps) and broken (lockfile is read-only). Solution: remove per-package installs from entrypoint and Dockerfile.

## Resolution

root_cause: Two-part failure. (1) docker-compose.dev.yml mounts named Docker volumes over all node_modules directories. On first run those volumes are empty, shadowing build-time installs. (2) The fix attempt added per-package npm install calls to the entrypoint, but /app/package-lock.json is bind-mounted :ro, so npm install fails with EROFS errno -30 trying to update the lockfile. The root npm ci already installs all workspace dependencies via hoisting into /app/node_modules - the per-package calls are redundant.

fix: Remove the three per-package npm install calls from both docker-dev-entrypoint.sh and Dockerfile.dev. The root `npm ci` in the entrypoint is sufficient: it installs all workspace deps into root_node_modules, and Node.js module resolution walks up the directory tree to find them from any workspace package.

verification: docker-dev-entrypoint.sh now only runs `cd /app && npm ci`. Dockerfile.dev no longer has per-workspace RUN npm install steps. Awaiting human verification.
files_changed:
  - docker-dev-entrypoint.sh
  - Dockerfile.dev
