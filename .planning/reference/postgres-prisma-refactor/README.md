# PostgreSQL + Prisma Refactor Pack

This folder contains the target architecture and migration artifacts for moving the project from SQLite + raw SQL to PostgreSQL + Prisma.

Files:
- `MIGRATION-PLAN.md`: phased implementation plan with sequencing and risk controls
- `TARGET-SCHEMA.prisma`: proposed Prisma schema for the new data model
- `DECISIONS.md`: key architectural decisions and tradeoffs

Core direction:
- PostgreSQL as the primary database
- Prisma as the data access layer
- multiple chats per project
- soft delete for projects and tasks
- project-level task revision instead of a separate `task_revisions` table
- short-lived task change events instead of permanent mutation logging
