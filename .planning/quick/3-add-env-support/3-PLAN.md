---
phase: quick-add-env-support
plan: 03
type: execute
wave: 1
depends_on: []
files_modified: [.gitignore, package.json, package-lock.json, src/config.ts, src/index.ts]
autonomous: true
requirements: [ENV-01]

must_haves:
  truths:
    - "Environment variables can be loaded from .env file"
    - ".env file is excluded from git via .gitignore"
    - "dotenv package is installed as a dependency"
    - "Config is loaded before MCP server initialization"
    - "Existing GANTT_AUTOSAVE_PATH env var continues to work"
  artifacts:
    - path: ".env"
      provides: "Environment variable configuration file"
      contains: "GANTT_AUTOSAVE_PATH"
    - path: ".gitignore"
      provides: "Exclusion of .env from version control"
      contains: ".env"
    - path: "src/config.ts"
      provides: "Centralized environment configuration"
      exports: ["loadEnv", "getAutoSavePath"]
    - path: "src/index.ts"
      provides: "Server initialization with config loading"
      imports: ["./config.js"]
  key_links:
    - from: "src/index.ts main()"
      to: "src/config.ts loadEnv()"
      via: "import and call before server initialization"
      pattern: "import.*config.*from.*config"
    - from: "src/config.ts"
      to: "dotenv"
      via: "npm package for loading .env files"
      pattern: "dotenv.*config"
---
<objective>
Add .env file support for environment configuration

Purpose: Enable configuration via .env file for easier local development and deployment
Output: dotenv integration with .env.example template and .gitignore entry
</objective>

<execution_context>
@C:/Users/Volobuev/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Volobuev/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@src/index.ts
@.gitignore
@package.json

# Existing environment variable usage
- GANTT_AUTOSAVE_PATH is already read via process.env in src/index.ts (line 546)
- No dotenv package currently installed
- No .env file exists
- .gitignore does not exclude .env files

# Requirements
- Add dotenv package for loading .env files
- Create .env.example as a template for users
- Add .env to .gitignore to prevent committing secrets
- Create src/config.ts for centralized environment configuration
- Update src/index.ts to use config module
- Ensure .env is loaded before server initialization
</context>

<tasks>

<task type="auto">
  <name>Task 1: Install dotenv and add .env support files</name>
  <files>package.json, package-lock.json, .gitignore, .env.example</files>
  <action>
    1. Install dotenv package:
       npm install dotenv

    2. Add .env to .gitignore (after "# OS" section):
       # Environment variables
       .env
       .env.local
       .env.*.local

    3. Create .env.example file with content:
       # Gantt MCP Server Configuration
       # Copy this file to .env and configure your values

       # Autosave file path for task persistence
       # If not set, autosave is disabled unless enabled via MCP tool
       GANTT_AUTOSAVE_PATH=./gantt-data.json

  Use npm install dotenv --save to add as production dependency.
  </action>
  <verify>
    <automated>grep -q "dotenv" package.json && grep -q "\.env" .gitignore && test -f .env.example</automated>
    <manual>Verify .env.example exists and contains GANTT_AUTOSAVE_PATH</manual>
  </verify>
  <done>
    dotenv package installed in package.json
    .env and .env.local excluded via .gitignore
    .env.example template created with documentation
  </done>
</task>

<task type="auto">
  <name>Task 2: Create config module and integrate with server</name>
  <files>src/config.ts, src/index.ts</files>
  <action>
    Create src/config.ts:

    import dotenv from 'dotenv';

    // Load .env file (if exists)
    dotenv.config();

    export interface Config {
      GANTT_AUTOSAVE_PATH?: string;
    }

    /**
     * Get configuration from environment variables
     */
    export function getConfig(): Config {
      return {
        GANTT_AUTOSAVE_PATH: process.env.GANTT_AUTOSAVE_PATH,
      };
    }

    /**
     * Get autosave path from environment (or null if not set)
     */
    export function getAutoSavePath(): string | null {
      return process.env.GANTT_AUTOSAVE_PATH || null;
    }

    Then modify src/index.ts:

    1. Add import at top:
       import { getAutoSavePath } from './config.js';

    2. In main() function, replace the existing env check:
       OLD: const defaultPath = process.env.GANTT_AUTOSAVE_PATH || null;
       NEW: const defaultPath = getAutoSavePath();

    This centralizes environment configuration in one module.
  </action>
  <verify>
    <automated>npm run build && node -e "import('./dist/config.js').then(m => console.log('Config module loaded:', typeof m.getConfig))"</automated>
    <manual>Verify build succeeds and config module exports are available</manual>
  </verify>
  <done>
    src/config.ts created with getConfig() and getAutoSavePath() functions
    dotenv.config() called on module import
    src/index.ts imports and uses getAutoSavePath()
    Build succeeds with no TypeScript errors
    Existing GANTT_AUTOSAVE_PATH functionality preserved
  </done>
</task>

<task type="auto">
  <name>Task 3: Add .env file for local development</name>
  <files>.env</files>
  <action>
    Create .env file with local development defaults:

    # Gantt MCP Server Configuration
    GANTT_AUTOSAVE_PATH=./gantt-data.json

    This file will be excluded by git and used for local development only.
  </action>
  <verify>
    <automated>test -f .env && grep -q "GANTT_AUTOSAVE_PATH" .env</automated>
    <manual>Verify .env file exists locally and is not tracked by git</manual>
  </verify>
  <done>
    .env file created with GANTT_AUTOSAVE_PATH=./gantt-data.json
    File exists locally but is excluded from version control
  </done>
</task>

</tasks>

<verification>
1. npm install dotenv succeeds and package.json updated
2. .gitignore contains .env entries
3. .env.example template created with documentation
4. .env file created for local development
5. src/config.ts created with getConfig() and getAutoSavePath()
6. src/index.ts imports and uses config module
7. Build succeeds: npm run build completes without errors
8. Existing GANTT_AUTOSAVE_PATH functionality continues to work
</verification>

<success_criteria>
- dotenv package installed as dependency
- .env and .env.local excluded via .gitignore
- .env.example template created for reference
- .env file created for local development
- src/config.ts provides centralized environment access
- src/index.ts uses config module instead of direct process.env
- Build succeeds with no errors
- Environment variables loaded from .env file on startup
</success_criteria>

<output>
After completion, create `.planning/quick/3-add-env-support/3-SUMMARY.md`
</output>
