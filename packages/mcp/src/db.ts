/**
 * SQLite database initialization for MCP server
 *
 * Initializes the database with tables for tasks, dependencies, and messages.
 * Uses @libsql/client for SQLite access (no native compilation required).
 */

import { createClient, type Client } from '@libsql/client';

let _db: Client | null = null;

export type DbClient = Client;

/**
 * Get (or lazily initialize) the singleton SQLite client.
 * Creates all required tables if they do not exist.
 *
 * DB path resolved from env var DB_PATH, defaulting to './gantt.db'.
 */
export async function getDb(): Promise<Client> {
  if (_db) return _db;

  const dbPath = process.env.DB_PATH ?? './gantt.db';
  _db = createClient({ url: `file:${dbPath}` });

  await _db.execute(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      color TEXT,
      progress REAL DEFAULT 0
    )
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
      role TEXT NOT NULL CHECK(role IN ('user','assistant')),
      content TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `);

  return _db;
}
