import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { storageVolumeCapacity } from '../storage/volume';
import { sendAlert } from './alerts';
import type { WorkerContext } from './worker-context';

export async function alerts({ database }: Pick<WorkerContext, 'database'>) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.NUVEX_ALERT_FROM;
  const to = process.env.NUVEX_ALERT_TO;
  if (!key || !from || !to) return;
  const disk = await storageVolumeCapacity();
  const issues: [string, string][] = [];
  if (disk.availableBytes < 5n * 1024n ** 3n || disk.availableBytes * 10n < disk.totalBytes) issues.push(['disk', 'Queda poco espacio en el disco de Nuvex.']);
  const backup = await stat(join(process.env.NUVEX_BACKUP_STATE ?? '/backup-state', 'last-success')).catch(() => null);
  if (!backup || Date.now() - backup.mtimeMs > 26 * 3600_000) issues.push(['backup', 'Falta un respaldo reciente de Nuvex.']);
  for (const [id, message] of issues) {
    const alert = 'alert:' + id + ':' + new Date().toISOString().slice(0, 10);
    if (await database.setting.findUnique({ where: { key: alert } })) continue;
    await sendAlert({ key, from, to, idempotencyKey: alert, message });
    await database.setting.upsert({ where: { key: alert }, create: { key: alert, value: 'sent' }, update: {} });
  }
}
