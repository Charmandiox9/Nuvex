import 'dotenv/config';
import { Worker, type Job } from 'bullmq';
import { log } from '../common/logging';
import { createDatabase } from '../../prisma/client';
import { openQueue, queueName, redisOptions } from '../queue/queue';
import { Storage } from '../storage/storage';
import { alerts } from './alerts.processor';
import { importItem } from './import.processor';
import { maintenance, purge } from './maintenance.processor';
import { renderMedia, watermark } from './media.processor';
import type { WorkerContext } from './worker-context';

const database = createDatabase();
const queue = openQueue();
const context: WorkerContext = { database, queue, storage: new Storage() };

async function processJob(job: Job<{ id: string; guestId?: string }>) {
  const { id, guestId } = job.data;
  if (job.name === 'maintenance') return maintenance(context);
  if (job.name === 'alerts') return alerts(context);
  if (job.name === 'purge') return purge(context, id);
  if (job.name === 'import') return importItem(context, id);
  if (job.name === 'watermark' && guestId) return watermark(context, id, guestId);
  if (!['preview', 'transcode'].includes(job.name)) throw new Error('Trabajo desconocido.');
  const row = await database.entry.findUnique({ where: { id } });
  if (!row || row.trashedAt) return;
  await database.entry.update({ where: { id }, data: { mediaStatus: 'processing' } });
  await renderMedia(context, row, job.name === 'transcode');
}

async function run() {
  const worker = new Worker(queueName, processJob, { connection: { ...redisOptions(), maxRetriesPerRequest: null }, concurrency: 1 });
  worker.on('error', (error) => log('error', 'worker connection error', { error: error.message }));
  worker.on('failed', (job, error) => {
    if (!job) return;
    log('warn', 'job failed', { name: job.name, id: job.id });
    if (process.env.NUVEX_INTEGRATION === '1') log('error', 'job error', { error: error.message });
    if (job.attemptsMade < (job.opts.attempts ?? 1)) return;
    const id = job.data.id;
    const record = job.name === 'import'
      ? database.importItem.updateMany({ where: { id, state: { not: 'completed' } }, data: { state: 'failed', error: 'No se pudo guardar el archivo. Comprueba el enlace, el destino o la cuota.' } })
      : ['preview', 'transcode'].includes(job.name)
        ? database.entry.updateMany({ where: { id }, data: { mediaStatus: 'failed' } })
        : database.audit.create({ data: { action: 'worker.failed.' + job.name, target: id || undefined } });
    void record.catch(() => log('error', 'job failure not recorded'));
  });
  await queue.upsertJobScheduler('maintenance', { every: 60_000 }, { name: 'maintenance', data: { id: '' } });
  if (process.env.RESEND_API_KEY) {
    await queue.upsertJobScheduler('alerts', { every: 3600_000 }, {
      name: 'alerts', data: { id: '' }, opts: { attempts: 3, backoff: { type: 'exponential', delay: 1500 }, removeOnComplete: true, removeOnFail: 50 },
    });
  } else {
    await queue.removeJobScheduler('alerts');
  }
  async function stop() { await worker.close(); await queue.close(); await database.$disconnect(); }
  process.on('SIGTERM', () => { void stop(); });
  process.on('SIGINT', () => { void stop(); });
}

run().catch((error: unknown) => { log('error', 'worker crashed', { error: error instanceof Error ? error.message : String(error) }); process.exit(1); });
