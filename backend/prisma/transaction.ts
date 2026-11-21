import type { Prisma, PrismaClient } from './generated/client';

export async function serialTransaction<T>(db: PrismaClient, operation: (tx: Prisma.TransactionClient) => Promise<T>) {
  for (let attempt = 1; ; attempt++) {
    try { return await db.$transaction(operation, { isolationLevel: 'Serializable' }); }
    catch (error) {
      const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
      if (code !== 'P2034' || attempt === 3) throw error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 20 + Math.random() * 25));
    }
  }
}
