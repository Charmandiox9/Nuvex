import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/client';

export function createDatabase() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL es obligatoria.');
  return new PrismaClient({ adapter: new PrismaPg({ connectionString, max: 6 }) });
}
