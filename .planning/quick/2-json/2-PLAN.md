---
phase: quick-json-autosave
plan: 02
type: execute
wave: 1
depends_on: []
files_modified: [src/store.ts, src/index.ts, src/types.ts]
autonomous: true
requirements: [JSON-02]

must_haves:
  truths:
    - "Tasks are automatically saved to JSON file on disk after changes"
    - "Tasks are automatically loaded from JSON file on server startup"
    - "File path is configurable via environment variable or default location"
    - "File operations are non-blocking and async"
    - "Errors during file save do not break task operations"
  artifacts:
    - path: "src/store.ts"
      provides: "autosave functionality with file path configuration"
      exports: ["setAutoSavePath", "loadFromFile", "saveToFile"]
    - path: "src/index.ts"
      provides: "MCP tool for setting autosave path and loading on startup"
      exports: ["set_autosave_path tool"]
    - path: "src/types.ts"
      provides: "AutoSaveInput type for path configuration"
  key_links:
    - from: "TaskStore constructor"
      to: "loadFromFile()"
      via: "call on initialization if path configured"
      pattern: "this\\.loadFromFile"
    - from: "TaskStore create/update/delete"
      to: "saveToFile()"
      via: "call after each mutation"
      pattern: "this\\.saveToFile"
    - from: "saveToFile()"
      to: "fs.writeFile"
      via: "Node.js fs/promises module"
      pattern: "await.*writeFile"
---

<objective>
Add automatic JSON file persistence to TaskStore

Purpose: Enable automatic saving and loading of tasks to/from a JSON file on disk, so data persists between server restarts
Output: Autosave functionality in TaskStore with configurable file path
</objective>

<execution_context>
@C:/Users/Volobuev/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Volobuev/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/quick/1-json/1-SUMMARY.md
@src/store.ts
@src/types.ts
@src/index.ts

# Existing patterns
- TaskStore uses Map<string, Task> for in-memory storage
- exportTasks() returns JSON string, importTasks() accepts JSON string
- MCP tools follow pattern: validate input, call store method, return result
- Error handling: throw Error with descriptive messages for validation failures

# New requirements
- Add async file operations using Node.js fs/promises
- Configurable autosave path (default: ./gantt-data.json)
- Load from file on server startup if file exists
- Save to file after every create/update/delete operation
- Gracefully handle file I/O errors (log but don't break operations)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add autosave functionality to TaskStore</name>
  <files>src/store.ts</files>
  <action>
    Add autosave functionality to TaskStore class:

    1. Import fs/promises at top of file:
       import * as fs from 'node:fs/promises';

    2. Add private fields to TaskStore class:
       private autoSavePath: string | null = null;
       private savePromise: Promise<void> | null = null;

    3. Add public method setAutoSavePath(path: string): void
       - Sets this.autoSavePath = path
       - If path provided, call this.loadFromFile() to load existing data

    4. Add private async method saveToFile(): Promise<void>
       - If !this.autoSavePath return (no-op)
       - Get JSON: const json = this.exportTasks()
       - Write file: await fs.writeFile(this.autoSavePath, json, 'utf-8')
       - Wrap in try/catch - log errors with console.error but don't throw

    5. Add private async method loadFromFile(): Promise<void>
       - If !this.autoSavePath return
       - Try to read file: const json = await fs.readFile(this.autoSavePath, 'utf-8')
       - Parse and import: this.importTasks(json)
       - Wrap in try/catch - if file doesn't exist (ENOENT), silently ignore
       - For other errors, log but continue

    6. Modify existing methods to call saveToFile() after changes:
       - create(): after this.tasks.set(id, task), await this.saveToFile()
       - update(): after this.tasks.set(id, updated), await this.saveToFile()
       - delete(): after this.tasks.delete(id), await this.saveToFile()

    7. Handle race conditions: Use this.savePromise to queue saves
       - In saveToFile(): if (this.savePromise) { await this.savePromise; }
       - Set this.savePromise = save operation, then clear when done

    Use default path './gantt-data.json' if no path configured.
  </action>
  <verify>
    <automated>node -e "import('./dist/store.js').then(async (m) => { const s = new m.TaskStore(); s.setAutoSavePath('./test-autosave.json'); s.create({name:'Test',startDate:'2026-01-01',endDate:'2026-01-02'}); await new Promise(r => setTimeout(r, 100)); const data = await (await import('node:fs/promises')).readFile('./test-autosave.json', 'utf-8'); console.log('Saved:', data); await (await import('node:fs/promises')).unlink('./test-autosave.json'); })"</automated>
    <manual>Verify that gantt-data.json file is created after creating a task</manual>
  </verify>
  <done>
    setAutoSavePath() configures file path and loads existing data
    saveToFile() writes current tasks to JSON file asynchronously
    loadFromFile() loads tasks from JSON file on startup
    create/update/delete methods trigger automatic save
    File I/O errors are logged but don't break operations
  </done>
</task>

<task type="auto">
  <name>Task 2: Add MCP tool for autosave configuration</name>
  <files>src/index.ts, src/types.ts</files>
  <action>
    First, add to types.ts:
    - export interface AutoSaveInput { filePath?: string }

    Then, modify src/index.ts:

    1. Add set_autosave_path tool to tools array:
       - name: "set_autosave_path"
       - description: "Enable automatic saving of tasks to a JSON file. If no path provided, uses './gantt-data.json'. Loads existing data if file exists."
       - inputSchema: { type: "object", properties: { filePath: { type: "string", description: "Optional file path for autosave (default: ./gantt-data.json)" } } }

    2. Add handler in CallToolRequestSchema:
       if (name === 'set_autosave_path') {
         const { filePath } = args as { filePath?: string };
         const path = filePath || './gantt-data.json';
         taskStore.setAutoSavePath(path);
         return {
           content: [{
             type: "text",
             text: JSON.stringify({ success: true, autoSavePath: path, message: `Autosave enabled: ${path}` }, null, 2)
           }]
         };
       }

    3. Optional: Add initialization in main() to check environment variable:
       const defaultPath = process.env.GANTT_AUTOSAVE_PATH || null;
       if (defaultPath) { taskStore.setAutoSavePath(defaultPath); }

    Follow existing MCP tool patterns in src/index.ts.
  </action>
  <verify>
    <automated>npm run build && node -e "import('./dist/index.js').then(m => console.log('MCP server with autosave built successfully'))"</automated>
    <manual>Test that set_autosave_path tool creates the JSON file after task operations</manual>
  </verify>
  <done>
    set_autosave_path tool enables autosave with configurable or default path
    Environment variable GANTT_AUTOSAVE_PATH can set default path
    Tool returns success message with actual path being used
    Build succeeds with no TypeScript errors
  </done>
</task>

</tasks>

<verification>
1. Build succeeds: npm run build completes without errors
2. set_autosave_path tool configures autosave path correctly
3. JSON file is created after first task creation when autosave enabled
4. JSON file is updated after each task update/delete
5. Tasks are loaded from file on server startup
6. File I/O errors are handled gracefully (logged, not thrown)
7. Missing file on startup doesn't crash the server
</verification>

<success_criteria>
- TaskStore has setAutoSavePath() method
- Autosave triggers automatically after create/update/delete operations
- JSON file is created/updated asynchronously
- Existing data is loaded on startup if file exists
- File path is configurable via MCP tool or environment variable
- Default path is './gantt-data.json'
- Errors during file operations don't break task operations
- Build succeeds with no TypeScript errors
</success_criteria>

<output>
After completion, create `.planning/quick/2-json/2-SUMMARY.md`
</output>
