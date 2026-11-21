import { stat, statfs } from 'node:fs/promises';
import { join } from 'node:path';
import { sendAlert } from './alerts';
import type { WorkerContext } from './worker-context';

export async function alerts({ database }: Pick<WorkerContext, 'database'>) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.NUVEX_ALERT_FROM;
  const to = process.env.NUVEX_ALERT_TO;
  if (!key || !from || !to) return;
  const disk = await statfs(process.env.NUVEX_DISK_PATH ?? '/data-health');
  const issues: [string, string][] = [];
  if (disk.bavail * disk.bsize < 5 * 1024 ** 3 || disk.bavail / disk.blocks < 0.1) issues.push(['disk', 'Queda poco espacio en el disco de Nuvex.']);
  const backup = await stat(join(process.env.NUVEX_BACKUP_STATE ?? '/backup-state', 'last-success')).catch(() => null);
  if (!backup || Date.now() - backup.mtimeMs > 26 * 3600_000) issues.push(['backup', 'Falta un respaldo reciente de Nuvex.']);
  for (const [id, message] of issues) {
    const alert = 'alert:' + id + ':' + new Date().toISOString().slice(0, 10);
    if (await database.setting.findUnique({ where: { key: alert } })) continue;
    await sendAlert({ key, from, to, idempotencyKey: alert, message });
    await database.setting.upsert({ where: { key: alert }, create: { key: alert, value: 'sent' }, update: {} });
  }
}
