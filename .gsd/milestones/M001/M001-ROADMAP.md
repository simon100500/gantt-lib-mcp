# M001: gantt-lib MCP Server

**Vision:** Развить проект от MCP-сервера для диаграмм Ганта до полноценного AI-управляемого Gantt-приложения с web UI, real-time sync, auth и устойчивой рабочей средой.

## Success Criteria


## Slices

- [x] **S01: Mcp Server Foundation** `risk:medium` `depends:[]`
  > After this: Initialize a working TypeScript MCP server that communicates via stdio transport.
- [x] **S02: Task Crud Data Model** `risk:medium` `depends:[S01]`
  > After this: Implement complete task CRUD operations with gantt-lib compatible data types.
- [x] **S03: Auto Schedule Engine** `risk:medium` `depends:[S02]`
  > After this: Implement auto-scheduling engine that cascades date changes through dependency chains with full support for FS/SS/FF/SF dependency types, circular dependency detection, and missing task validation.
- [x] **S04: Testing & Validation** `risk:medium` `depends:[S03]`
  > After this: unit tests prove Testing & Validation works
- [x] **S05: Batch Tasks** `risk:medium` `depends:[S04]`
  > After this: Implement batch task creation tool for generating multiple related tasks from a template with repeat parameters (sections, floors, etc.
- [x] **S06: Qwen Agent** `risk:medium` `depends:[S05]`
  > After this: Create the Wave 0 scaffold for the qwen-agent: unit test file (failing tests that define expected behaviors), system prompt Markdown file, and a TypeScript compiler config for the agent directory.
- [x] **S07: Web Ui With Real Time Gantt Editing Via Ai Dialogue** `risk:medium` `depends:[S06]`
  > After this: Convert the existing single-package project into an npm workspaces monorepo with three packages: `@gantt/mcp`, `@gantt/server`, and `@gantt/web`.
- [x] **S08: Integrate Gantt Lib Library** `risk:medium` `depends:[S07]`
  > After this: Install gantt-lib package and integrate it into the web package, replacing the placeholder GanttChart component with the actual gantt-lib React component.
- [ ] **S09: Session Control** `risk:medium` `depends:[S08]`
  > After this: Wipe the existing SQLite schema and replace it with the multi-user schema.
- [x] **S10: Work Stability** `risk:medium` `depends:[S09]`
  > After this: Fix three server-side/MCP bugs that cause silent data corruption and chat UX breakage:

- Bug 3: MCP child process runs without PROJECT_ID, so tasks are created with project_id=NULL.
