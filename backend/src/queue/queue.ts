import { Queue } from 'bullmq';

export const queueName = 'nuvex';
export function redisOptions() {
  const url = new URL(process.env.REDIS_URL ?? 'redis://127.0.0.1:6379');
  return {
    host: url.hostname, port: Number(url.port || 6379), db: Number(url.pathname.slice(1) || 0),
    ...(url.password ? { password: decodeURIComponent(url.password) } : {}),
    ...(url.protocol === 'rediss:' ? { tls: {} } : {}),
  };
}

export function openQueue() {
  return new Queue<{ id: string; guestId?: string }, void, string>(queueName, {
    connection: { ...redisOptions(), maxRetriesPerRequest: 1 },
    defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 1500 }, removeOnComplete: true, removeOnFail: 50 },
  });
}
