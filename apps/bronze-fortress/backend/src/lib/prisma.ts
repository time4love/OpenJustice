import { PrismaClient } from '../generated/prisma';

// Singleton — reuse across requests; prevents connection pool exhaustion.
const prisma = new PrismaClient();

export { prisma };
