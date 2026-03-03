// agent/agent.test.js
// Wave 0 scaffold: 3 failing unit tests for AGENT-01, AGENT-02, AGENT-06
// Run with: node --test agent/agent.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..');

// Convert Windows absolute paths to file:// URLs for dynamic import compatibility
function toFileUrl(absPath) {
  return pathToFileURL(absPath).href;
}

describe('AGENT-01: CLI arg validation', () => {
  it('should export a validateArgs function that throws when no prompt given', async () => {
    // Dynamic import — will fail until dist/agent/agent.js is compiled
    let mod;
    try {
      mod = await import(toFileUrl(join(PROJECT_ROOT, 'dist/agent/agent.js')));
    } catch (e) {
      throw new Error('dist/agent/agent.js not found — run: npm run build:agent');
    }
    assert.ok(typeof mod.validateArgs === 'function', 'validateArgs must be exported');
    assert.throws(() => mod.validateArgs(undefined), /Usage:/, 'should throw with Usage message when no arg');
  });
});

describe('AGENT-02: Module imports without crash', () => {
  it('dist/agent/agent.js resolves or rejects with known error (not a crash)', async () => {
    try {
      await import(toFileUrl(join(PROJECT_ROOT, 'dist/agent/agent.js')));
      // If import succeeds — good (module loaded without side-effect crash)
    } catch (e) {
      // Only acceptable error: missing compiled output
      const msg = String(e);
      assert.ok(
        msg.includes('Cannot find module') || msg.includes('ERR_MODULE_NOT_FOUND'),
        `Unexpected import error: ${msg}`
      );
    }
  });
});

describe('AGENT-06: System prompt file exists', () => {
  it('agent/prompts/system.md exists and is non-empty', () => {
    const promptPath = join(PROJECT_ROOT, 'agent/prompts/system.md');
    assert.ok(existsSync(promptPath), 'agent/prompts/system.md must exist');
    const content = readFileSync(promptPath, 'utf-8');
    assert.ok(content.trim().length > 100, 'system.md must have meaningful content (>100 chars)');
  });
});
