'use client';

import { useEffect, useRef, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { message } from '@/lib/format';
import type { TFunction } from '@/i18n/provider';

type TransferState = 'queued' | 'verifying' | 'uploading' | 'finishing' | 'completed' | 'cancelled' | 'interrupted';
export type Transfer = { id: string; name: string; sent: number; total: number; state: TransferState; error?: string };

type Saved = { id: string; fingerprint: string; parentId: string; sourceName?: string; overwrite?: boolean };
type Task = {
  id: string; file: File; parentId: string; folders: Map<string, Promise<string>>;
  state: TransferState; controller?: AbortController; upload?: Saved;
};
function isSaved(value: unknown): value is Saved {
  return Boolean(value && typeof value === 'object'
    && 'id' in value && typeof value.id === 'string'
    && 'fingerprint' in value && typeof value.fingerprint === 'string'
    && 'parentId' in value && typeof value.parentId === 'string'
    && (!('sourceName' in value) || typeof value.sourceName === 'string')
    && (!('overwrite' in value) || typeof value.overwrite === 'boolean'));
}
function readSaved(): Saved[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem('nuvex-uploads') ?? '[]');
    return Array.isArray(saved) ? saved.filter(isSaved) : [];
  } catch { return []; }
}
function save(rows: Saved[]) {
  try { localStorage.setItem('nuvex-uploads', JSON.stringify(rows)); }
  catch { /* The current page can still retry with its in-memory session. */ }
}
const block = 8 * 1024 * 1024;
const concurrency = 3;

async function fingerprint(file: File, signal: AbortSignal) {
  const hashes = [];
  for (let offset = 0; offset < file.size; offset += block) {
    signal.throwIfAborted();
    hashes.push(Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await file.slice(offset, offset + block).arrayBuffer()))));
  }
  const value = new TextEncoder().encode(JSON.stringify([file.size, hashes]));
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', value)), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function useTransfers(refresh: () => void, t: TFunction) {
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const tasks = useRef(new Map<string, Task>());
  const pending = useRef<string[]>([]);
  const active = useRef(0);
  const claimedUploads = useRef(new Set<string>());
  useEffect(() => () => {
    pending.current.length = 0;
    for (const task of tasks.current.values()) task.controller?.abort();
  }, []);
  function update(task: Task, values: Partial<Transfer>) {
    if (values.state) task.state = values.state;
    setTransfers((previous) => previous.map((item) => item.id === task.id ? { ...item, ...values } : item));
  }

  async function cancelUpload(upload?: Saved) {
    if (!upload) return;
    save(readSaved().filter((row) => row.id !== upload.id));
    await api('/uploads/' + upload.id, 'DELETE').catch(() => undefined);
  }

  function cancel(id: string) {
    const task = tasks.current.get(id);
    if (!task || !['queued', 'verifying', 'uploading'].includes(task.state)) return;
    update(task, { state: 'cancelled', error: undefined });
    tasks.current.delete(id);
    if (task.controller) task.controller.abort();
    else {
      if (task.upload) claimedUploads.current.delete(task.upload.id);
      void cancelUpload(task.upload);
    }
  }

  async function uploadFile(task: Task) {
    const { file, parentId, folders } = task;
    const controller = new AbortController();
    task.controller = controller;
    const { signal } = controller;
    update(task, { state: 'verifying' });
    try {
      let destination = parentId;
      let path = '';
      for (const folder of file.webkitRelativePath.split('/').slice(0, -1)) {
        path += '/' + folder;
        let known = folders.get(path);
        if (!known) {
          // Folder creation is shared by siblings, so cancelling one file cannot abort it.
          const folderPath = path;
          known = api<{ id: string }>('/folders/ensure', 'POST', { name: folder, parentId: destination })
            .then((created) => created.id).catch((error: unknown) => { folders.delete(folderPath); throw error; });
          folders.set(path, known);
        }
        destination = await known;
        signal.throwIfAborted();
      }
      const mark = task.upload?.fingerprint ?? await fingerprint(file, signal);
      signal.throwIfAborted();
      const candidate = task.upload ?? readSaved().find((row) => row.parentId === destination && row.fingerprint === mark
        && (!row.sourceName || row.sourceName === file.name) && !claimedUploads.current.has(row.id));
      if (candidate) claimedUploads.current.add(candidate.id);
      type Status = { name: string; state: string; parts: { PartNumber: number; Size: number }[] };
      let existing: Status | undefined;
      if (candidate) {
        try {
          const status = await api<Status>('/uploads/' + candidate.id, 'GET', undefined, signal);
          signal.throwIfAborted();
          if (candidate.sourceName === file.name || status.name === file.name) {
            if (status.state === 'completed') {
              save(readSaved().filter((row) => row.id !== candidate.id));
              update(task, { sent: file.size, state: 'completed' });
              refresh();
              return;
            }
            if (['open', 'finished-object'].includes(status.state)) existing = status;
            else save(readSaved().filter((row) => row.id !== candidate.id));
          }
        } catch (error) {
          if (!(error instanceof ApiError) || error.status !== 404) throw error;
          save(readSaved().filter((row) => row.id !== candidate.id));
        } finally {
          if (!existing && task.upload?.id !== candidate.id) claimedUploads.current.delete(candidate.id);
        }
      }
      let upload = existing ? candidate?.id : undefined;
      let overwrite = existing ? (candidate?.overwrite ?? false) : false;
      if (!existing && candidate) claimedUploads.current.delete(candidate.id);
      task.upload = existing ? candidate : undefined;
      if (!upload) {
        const data = { name: file.name, mime: file.type || 'application/octet-stream', size: file.size, parentId: destination, fingerprint: mark };
        try {
          upload = (await api<{ id: string }>('/uploads', 'POST', data, signal)).id;
        } catch (error) {
          signal.throwIfAborted();
          if (!(error instanceof ApiError) || !error.suggestedName) throw error;
          if (window.confirm(t('transfers.exists', { name: file.name }))) overwrite = true;
          else if (window.confirm(t('transfers.saveAs', { name: error.suggestedName }))) data.name = error.suggestedName;
          else throw new Error(t('transfers.skipped'));
          upload = (await api<{ id: string }>('/uploads', 'POST', { ...data, overwrite }, signal)).id;
        }
        task.upload = { id: upload, fingerprint: mark, parentId: destination, sourceName: file.name, overwrite };
        claimedUploads.current.add(upload);
        save([...readSaved(), task.upload]);
      }
      signal.throwIfAborted();
      update(task, { state: 'uploading', sent: existing?.state === 'finished-object' ? file.size : 0 });
      const parts = new Set(existing?.parts.map((part) => part.PartNumber));
      for (let start = 0, part = 1; existing?.state !== 'finished-object' && start < file.size; start += block, part++) {
        const end = Math.min(start + block, file.size);
        if (!parts.has(part)) await api('/uploads/' + upload + '/parts/' + part, 'PUT', file.slice(start, end), signal);
        signal.throwIfAborted();
        update(task, { sent: end });
      }
      update(task, { state: 'finishing' });
      try { await api('/uploads/' + upload + '/complete', 'POST', { overwrite }); }
      catch (error) {
        if (!(error instanceof ApiError) || !error.suggestedName || !window.confirm(t('transfers.nameExists'))) throw error;
        if (task.upload) {
          task.upload.overwrite = true;
          save(readSaved().map((row) => row.id === upload ? { ...row, overwrite: true } : row));
        }
        await api('/uploads/' + upload + '/complete', 'POST', { overwrite: true });
      }
      save(readSaved().filter((row) => row.id !== upload));
      update(task, { sent: file.size, state: 'completed' });
      refresh();
    } catch (error) {
      if (signal.aborted) {
        if (task.state === 'cancelled') await cancelUpload(task.upload);
      }
      else update(task, { state: 'interrupted', error: error instanceof TypeError ? t('transfers.retryHint') : message(error) });
    } finally {
      if (task.upload && task.state !== 'interrupted') claimedUploads.current.delete(task.upload.id);
      task.controller = undefined;
      if (task.state !== 'interrupted') tasks.current.delete(task.id);
    }
  }

  function drain() {
    while (active.current < concurrency && pending.current.length) {
      const id = pending.current.shift();
      const task = id ? tasks.current.get(id) : undefined;
      if (!task) continue;
      active.current++;
      void uploadFile(task).finally(() => { active.current--; drain(); });
    }
  }

  function add(files: File[], parentId: string) {
    if (!files.length) return;
    const folders = new Map<string, Promise<string>>();
    const batch = files.map((file): Transfer => {
      const id = crypto.randomUUID();
      tasks.current.set(id, { id, file, parentId, folders, state: 'queued' });
      pending.current.push(id);
      return { id, name: file.name, total: file.size, sent: 0, state: 'queued' };
    });
    setTransfers((previous) => [...batch, ...previous]);
    drain();
  }

  function retry(id: string) {
    const task = tasks.current.get(id);
    if (!task || task.state !== 'interrupted') return;
    update(task, { state: 'queued', error: undefined });
    pending.current.push(id);
    drain();
  }

  return { transfers, add, cancel, retry };
}
