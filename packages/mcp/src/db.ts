/**
 * SQLite database initialization for MCP server
 *
 * Multi-user schema with support for users, projects, sessions, and OTP codes.
 * Uses @libsql/client for SQLite access (no native compilation required).
 *
 * IMPORTANT: During Phase 9 development, all tables are dropped and recreated
 * on every getDb() call to provide a clean slate. This will be removed after
 * Phase 9 is complete.
 */

import { createClient, type Client } from '@libsql/client';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { writeMcpDebugLog } from './debug-log.js';

let _db: Client | null = null;

export type DbClient = Client;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = process.env.GANTT_PROJECT_ROOT ?? join(__dirname, '../../..');

async function ensureTaskColumn(db: Client, columnName: string, definition: string): Promise<void> {
  const tableInfo = await db.execute('PRAGMA table_info(tasks)');
  const hasColumn = tableInfo.rows.some((row) => String(row['name']) === columnName);
  if (!hasColumn) {
    await db.execute(`ALTER TABLE tasks ADD COLUMN ${definition}`);
  }
}

/**
 * Get (or lazily initialize) the singleton SQLite client.
 * Creates all required tables if they do not exist.
 *
 * DB path resolved from env var DB_PATH, defaulting to the project-root gantt.db.
 */
export async function getDb(): Promise<Client> {
  if (_db) return _db;

  const dbPath = process.env.DB_PATH ?? join(PROJECT_ROOT, 'gantt.db');
  await writeMcpDebugLog('db_initialized', {
    dbPath,
    projectId: process.env.PROJECT_ID,
  });
  _db = createClient({ url: `file:${dbPath}` });

  // Create all tables in FK-safe order (tables are created with IF NOT EXISTS, so safe to run on every startup)
  await _db.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL
    )
  `);

  await _db.execute(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `);

  await _db.execute(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      access_token TEXT NOT NULL UNIQUE,
      refresh_token TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `);

  await _db.execute(`
    CREATE TABLE IF NOT EXISTS otp_codes (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      code TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      used INTEGER NOT NULL DEFAULT 0
    )
  `);

  await _db.execute(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      color TEXT,
      progress REAL DEFAULT 0
    )
  `);

  await ensureTaskColumn(_db, 'parent_id', 'parent_id TEXT REFERENCES tasks(id) ON DELETE SET NULL');
  await ensureTaskColumn(_db, 'sort_order', 'sort_order INTEGER NOT NULL DEFAULT 0');
  await _db.execute(`
    UPDATE tasks
    SET sort_order = rowid
    WHERE sort_order IS NULL OR sort_order = 0
  `);

  await _db.execute(`
    CREATE TABLE IF NOT EXISTS dependencies (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      dep_task_id TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('FS','SS','FF','SF')),
      lag REAL DEFAULT 0
    )
  `);

  await _db.execute(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK(role IN ('user','assistant')),
      content TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `);

  await _db.execute(`
    CREATE TABLE IF NOT EXISTS share_links (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL
    )
  `);

  await _db.execute(`
    CREATE TABLE IF NOT EXISTS task_revisions (
      project_id TEXT PRIMARY KEY,
      revision INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    )
  `);

  await _db.execute(`
    CREATE TABLE IF NOT EXISTS task_mutations (
      id TEXT PRIMARY KEY,
      project_id TEXT,
      run_id TEXT,
      session_id TEXT,
      source TEXT NOT NULL CHECK(source IN ('agent', 'manual-save', 'api', 'system')),
      mutation_type TEXT NOT NULL CHECK(mutation_type IN ('create', 'update', 'delete', 'delete_all', 'import')),
      task_id TEXT,
      created_at TEXT NOT NULL
    )
  `);

  return _db;
}
