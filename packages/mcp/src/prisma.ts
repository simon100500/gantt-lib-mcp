/**
 * Prisma Client singleton with connection pooling
 *
 * Provides a singleton instance of Prisma Client for database access.
 * Includes graceful shutdown handlers to properly close connections.
 *
 * Connection pooling is configured via DATABASE_URL query parameters:
 * - connection_limit=10 (max concurrent connections)
 * - pool_timeout=20 (time to wait for available connection, in seconds)
 * - connect_timeout=10 (time to establish PostgreSQL connection, in seconds)
 */

import { PrismaClient } from '../dist/prisma-client/index.js';

/**
 * Global Prisma Client instance for hot module reload safety
 * In development, this prevents creating multiple Prisma Client instances
 * which can exhaust database connections.
 */
declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

/**
 * Get the singleton Prisma Client instance
 *
 * Creates a new instance if one doesn't exist, otherwise returns the cached instance.
 * The client is configured with connection pooling settings from DATABASE_URL.
 *
 * Connection pool configuration (via DATABASE_URL query params):
 * @example
 * DATABASE_URL="postgresql://user:pass@host:5432/db?connection_limit=10&pool_timeout=20&connect_timeout=10"
 *
 * @returns Prisma Client instance
 */
export function getPrisma(): PrismaClient {
  if (!global.prisma) {
    global.prisma = new PrismaClient({
      datasources: {
        db: {
          url: process.env.DATABASE_URL,
        },
      },
    });
  }

  return global.prisma;
}

/**
 * Graceful shutdown handler
 *
 * Disconnects Prisma Client when the process receives termination signals.
 * This prevents connection leaks and ensures clean shutdown.
 */
async function shutdownHandler(): Promise<void> {
  if (global.prisma) {
    await global.prisma.$disconnect();
    global.prisma = undefined;
  }
}

// Register graceful shutdown handlers
process.on('SIGTERM', shutdownHandler);
process.on('beforeExit', shutdownHandler);

// Export Prisma types for convenience
export type { PrismaClient } from '../dist/prisma-client/index.js';
export * from '../dist/prisma-client/index.js';
