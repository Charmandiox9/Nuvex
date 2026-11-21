import type { Prisma, PrismaClient } from './generated/client';

export async function serialTransaction<T>(db: PrismaClient, operation: (tx: Prisma.TransactionClient) => Promise<T>) {
  for (let attempt = 1; ; attempt++) {
    try { return await db.$transaction(operation, { isolationLevel: 'Serializable' }); }
    catch (error) {
      const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
      const cause = error instanceof Error && error.name === 'DriverAdapterError' ? error.cause : undefined;
      const writeConflict = typeof cause === 'object' && cause !== null && 'kind' in cause && cause.kind === 'TransactionWriteConflict';
      if (attempt === 3 || (code !== 'P2034' && !writeConflict)) throw error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 20 + Math.random() * 25));
    }
  }
}
