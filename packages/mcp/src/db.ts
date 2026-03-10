/**
 * Prisma database client for MCP server
 *
 * Replaces SQLite with PostgreSQL for multi-user real-time support.
 * Provides singleton PrismaClient instance with proper connection management.
 */

import { PrismaClient } from '@prisma/client';

let _db: PrismaClient | null = null;

export type DbClient = PrismaClient;

/**
 * Get (or lazily initialize) the singleton Prisma client.
 * Creates all required tables via Prisma migrations.
 *
 * Connection string resolved from env var DATABASE_URL.
 */
export async function getDb(): Promise<PrismaClient> {
  if (_db) return _db;

  _db = new PrismaClient();

  return _db;
}
