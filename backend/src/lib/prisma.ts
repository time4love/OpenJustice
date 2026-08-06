import { PrismaClient } from '@prisma/client';

// Singleton — reuse across requests; prevents connection pool exhaustion.
const prisma = new PrismaClient();

export { prisma };
