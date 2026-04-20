import { PrismaClient } from '@prisma/client';

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

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

async function shutdownHandler(): Promise<void> {
  if (global.prisma) {
    await global.prisma.$disconnect();
    global.prisma = undefined;
  }
}

process.on('SIGTERM', shutdownHandler);
process.on('beforeExit', shutdownHandler);

export type { PrismaClient } from '@prisma/client';
export * from '@prisma/client';
