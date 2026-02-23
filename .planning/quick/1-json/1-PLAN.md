---
phase: quick-json-export
plan: 01
type: execute
wave: 1
depends_on: []
files_modified: [src/store.ts, src/index.ts, src/types.ts]
autonomous: true
requirements: [JSON-01]

must_haves:
  truths:
    - "User can export all tasks to a JSON file"
    - "Exported JSON file contains all task data including dependencies"
    - "Exported JSON can be imported to restore tasks"
    - "File is saved with .json extension"
  artifacts:
    - path: "src/store.ts"
      provides: "exportTasks() and importTasks() methods"
      exports: ["exportTasks", "importTasks"]
    - path: "src/index.ts"
      provides: "MCP tools export_tasks and import_tasks"
      exports: ["export_tasks tool", "import_tasks tool"]
    - path: "src/types.ts"
      provides: "FilePathInput type for import/export operations"
  key_links:
    - from: "src/index.ts export_tasks tool"
      to: "src/store.ts exportTasks()"
      via: "method call"
      pattern: "store\\.exportTasks"
    - from: "src/index.ts import_tasks tool"
      to: "src/store.ts importTasks()"
      via: "method call"
      pattern: "store\\.importTasks"
---

<objective>
Add simple JSON export/import functionality to the MCP Gantt server

Purpose: Enable users to save their Gantt chart data to JSON files and restore it later
Output: Two new MCP tools (export_tasks, import_tasks) and supporting methods in TaskStore
</objective>

<execution_context>
@C:/Users/Volobuev/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Volobuev/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@src/store.ts
@src/types.ts
@src/index.ts

# Existing patterns
- TaskStore uses Map<string, Task> for in-memory storage
- MCP tools follow the pattern: validate input, call store method, return result
- Error handling: throw Error with descriptive messages for validation failures
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add export/import methods to TaskStore</name>
  <files>src/store.ts</files>
  <action>
    Add two methods to TaskStore class:

    1. exportTasks(): string - Returns JSON string of all tasks
       - Use Array.from(this.tasks.values()) to get all tasks
       - Return JSON.stringify(tasks, null, 2) for pretty-printed output
       - No validation needed (empty array is valid export)

    2. importTasks(jsonData: string): number - Import tasks from JSON, returns count imported
       - Parse JSON: const tasks = JSON.parse(jsonData) as Task[]
       - Validate: if (!Array.isArray(tasks)) throw new Error("Import data must be an array")
       - Clear existing tasks: this.tasks.clear()
       - Import each task: for (const task of tasks) { this.tasks.set(task.id, task) }
       - Return number of tasks imported

    Use Node.js built-in JSON (no external dependencies needed).
  </action>
  <verify>
    <automated>node -e "const s = new (await import('./dist/store.js')).TaskStore(); s.create({name:'Test',startDate:'2026-01-01',endDate:'2026-01-02'}); const json = s.exportTasks(); console.log(json); const count = s.importTasks(json); console.log('Imported:', count);"</automated>
    <manual>Verify JSON output contains task data with id, name, startDate, endDate fields</manual>
  </verify>
  <done>
    exportTasks() returns valid JSON string array of tasks
    importTasks() clears existing tasks and imports new ones from JSON
    Returns count of imported tasks
  </done>
</task>

<task type="auto">
  <name>Task 2: Add MCP tools for export/import</name>
  <files>src/index.ts, src/types.ts</files>
  <action>
    First, add to types.ts:
    - export interface FilePathInput { filePath: string }

    Then, add two MCP tools to server.tools array in src/index.ts:

    1. export_tasks tool:
       - name: "export_tasks"
       - description: "Export all tasks to JSON format"
       - inputSchema: { type: "object", properties: {} }
       - Handler: const json = taskStore.exportTasks(); return { content: [{ type: "text", text: json }] }

    2. import_tasks tool:
       - name: "import_tasks"
       - description: "Import tasks from JSON data (replaces all existing tasks)"
       - inputSchema: { type: "object", properties: { jsonData: { type: "string", description: "JSON string containing array of tasks" } }, required: ["jsonData"] }
       - Handler: try { const count = taskStore.importTasks(args.jsonData); return { content: [{ type: "text", text: `Imported ${count} tasks successfully` }] } } catch (e) { return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true } }

    Follow existing MCP tool patterns in src/index.ts (create_task, update_task).
  </action>
  <verify>
    <automated>npm run build && node -e "import('./dist/index.js').then(m => console.log('MCP server built successfully'))"</automated>
    <sampling_rate>run after this task commits</sampling_rate>
  </verify>
  <done>
    export_tasks tool returns JSON array of all tasks
    import_tasks tool accepts jsonData string and imports tasks
    import_tasks replaces all existing tasks with imported data
    Error handling returns user-friendly error messages
  </done>
</task>

</tasks>

<verification>
1. Build succeeds: npm run build completes without errors
2. export_tasks returns valid JSON with task array
3. import_tasks clears existing tasks and imports new ones
4. Import validation catches non-JSON or non-array data
5. Error messages are descriptive and user-friendly
</verification>

<success_criteria>
- MCP tools export_tasks and import_tasks are available
- export_tasks returns JSON string of all tasks
- import_tasks accepts JSON string and imports tasks
- Import replaces all existing tasks (not merges)
- Error handling for invalid JSON data
- Build succeeds with no TypeScript errors
</success_criteria>

<output>
After completion, create `.planning/quick/1-json/1-SUMMARY.md`
</output>
