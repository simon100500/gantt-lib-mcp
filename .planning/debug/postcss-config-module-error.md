---
status: verifying
trigger: "Vite build fails because postcss.config.js uses CommonJS syntax but packages/web/package.json has type: module"
created: 2026-03-05T00:00:00Z
updated: 2026-03-05T00:00:00Z
---

## Evidence
- timestamp: 2026-03-05T00:00:01Z
  checked: postcss.config.js and packages/web/package.json
  found: postcss.config.js uses `module.exports` (CommonJS) while package.json has `"type": "module"` (line 4)
  implication: Node.js treats .js files as ES modules, causing ReferenceError: module is not defined

## Current Focus
hypothesis: VERIFIED - ES module syntax fixes the issue
test: npm run build completed successfully
expecting: Build produces dist/ directory with assets
next_action: Request human verification checkpoint

## Symptoms
expected: vite build completes successfully
actual: Build fails with PostCSS config loading error
errors: |
  [vite:css] Failed to load PostCSS config (searchPath: D:/Projects/gantt-lib-mcp/packages/web):
  [ReferenceError] module is not defined in ES module scope
  This file is being treated as an ES module because it has a '.js' file extension
  and 'D:\Projects\gantt-lib-mcp\packages\web\package.json' contains "type": "module".
  To treat it as a CommonJS script, rename it to use the '.cjs' file extension.

  ReferenceError: module is not defined in ES module scope
      at file:///D:/Projects/gantt-lib-mcp/packages/web/postcss.config.js?t=1772742340647:1:1
reproduction: npm run build in packages/web directory
started: After Docker issue was fixed - pre-existing issue now exposed

## Evidence

## Eliminated

## Resolution
root_cause: postcss.config.js used CommonJS syntax (module.exports) but package.json has "type": "module", causing Node.js to treat .js files as ES modules
fix: Converted postcss.config.js from `module.exports = {...}` to `export default {...}` (ES module syntax)
verification: Build completes successfully - vite produces dist/ with index.html, CSS, and JS assets (364.06 kB JS, 35.95 kB CSS)
files_changed:
  - packages/web/postcss.config.js: Converted from CommonJS to ES module syntax
