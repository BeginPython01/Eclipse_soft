import { PrismaClient } from '@prisma/client';

/**
 * One Prisma client per process. Next.js dev reloads modules on every edit, so
 * without the global cache each reload opens a new connection pool until
 * Postgres refuses new connections.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db;
