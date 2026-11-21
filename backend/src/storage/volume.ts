import { statfs } from 'node:fs/promises';
import type { PrismaClient } from '../../prisma/generated/client';

export const storageVolumeKey = 'storage:volume';
const maxSampleAgeMs = 5 * 60_000;

export async function storageVolumeCapacity() {
  const disk = await statfs(process.env.NUVEX_DISK_PATH ?? '/data-health', { bigint: true });
  return { availableBytes: disk.bavail * disk.bsize, totalBytes: disk.blocks * disk.bsize };
}

export async function recordStorageVolume(database: PrismaClient) {
  const capacity = await storageVolumeCapacity().catch(() => null);
  if (!capacity || capacity.totalBytes <= 0n) return;
  const value = JSON.stringify({
    availableBytes: capacity.availableBytes.toString(), totalBytes: capacity.totalBytes.toString(), measuredAt: new Date().toISOString(),
  });
  await database.setting.upsert({ where: { key: storageVolumeKey }, create: { key: storageVolumeKey, value }, update: { value } });
}

export function recentStorageVolume(value?: string) {
  if (!value) return null;
  let data: unknown;
  try { data = JSON.parse(value); } catch { return null; }
  if (typeof data !== 'object' || data === null
    || !('availableBytes' in data) || typeof data.availableBytes !== 'string' || !/^\d+$/.test(data.availableBytes)
    || !('totalBytes' in data) || typeof data.totalBytes !== 'string' || !/^[1-9]\d*$/.test(data.totalBytes)
    || !('measuredAt' in data) || typeof data.measuredAt !== 'string') return null;
  const age = Date.now() - Date.parse(data.measuredAt);
  if (!Number.isFinite(age) || age < 0 || age > maxSampleAgeMs || BigInt(data.availableBytes) > BigInt(data.totalBytes)) return null;
  return { availableBytes: data.availableBytes, totalBytes: data.totalBytes, measuredAt: data.measuredAt };
}
