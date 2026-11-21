'use client';

import { useRef, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { message } from '@/lib/format';
import type { TFunction } from '@/i18n/provider';

export type Transfer = { id: string; name: string; sent: number; total: number; state: string; error?: string };

type Saved = { id: string; fingerprint: string; parentId: string };
const readSaved = (): Saved[] => {
  try { return JSON.parse(localStorage.getItem('nuvex-uploads') ?? '[]'); }
  catch { return []; }
};
const save = (rows: Saved[]) => localStorage.setItem('nuvex-uploads', JSON.stringify(rows));
const block = 8 * 1024 * 1024;

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
  const controls = useRef(new Map<string, { controller: AbortController; upload?: string }>());
  const running = useRef(false);
  const update = (id: string, values: Partial<Transfer>) =>
    setTransfers((previous) => previous.map((item) => item.id === id ? { ...item, ...values } : item));

  async function cancel(id: string) {
    const task = controls.current.get(id);
    if (!task) return;
    task.controller.abort();
    if (task.upload) {
      await api('/uploads/' + task.upload, 'DELETE').catch(() => undefined);
      save(readSaved().filter((row) => row.id !== task.upload));
    }
    update(id, { state: t('transfers.cancelled') });
  }

  async function add(files: File[], parentId: string) {
    if (running.current || !files.length) return;
    running.current = true;
    const folders = new Map<string, string>();
    try {
      for (const file of files) {
        const id = crypto.randomUUID();
        const task: { controller: AbortController; upload?: string } = { controller: new AbortController() };
        controls.current.set(id, task);
        const signal = task.controller.signal;
        setTransfers((old) => [{ id, name: file.name, sent: 0, total: file.size, state: t('transfers.verifying') }, ...old]);
        try {
          let destination = parentId;
          let path = '';
          for (const folder of file.webkitRelativePath.split('/').slice(0, -1)) {
            path += '/' + folder;
            let known = folders.get(path);
            if (!known) {
              const created = await api<{ id: string }>('/folders/ensure', 'POST', { name: folder, parentId: destination }, signal);
              known = created.id;
              folders.set(path, known);
            }
            destination = known;
          }
          const mark = await fingerprint(file, signal);
          const candidate = readSaved().find((row) => row.parentId === destination && row.fingerprint === mark);
          type Status = { name: string; state: string; parts: { PartNumber: number; Size: number }[] };
          const partial = candidate ? await api<Status>('/uploads/' + candidate.id, 'GET', undefined, signal).catch(() => null) : null;
          let existing = partial?.name === file.name && ['open', 'finished-object'].includes(partial.state) ? partial : undefined;
          let upload = existing ? candidate!.id : undefined;
          let overwrite = false;
          if (!upload) {
            const data = { name: file.name, mime: file.type || 'application/octet-stream', size: file.size, parentId: destination, fingerprint: mark };
            try {
              upload = (await api<{ id: string }>('/uploads', 'POST', data, signal)).id;
            } catch (error) {
              if (!(error instanceof ApiError) || !error.suggestedName) throw error;
              if (window.confirm(t('transfers.exists', { name: file.name }))) overwrite = true;
              else if (window.confirm(t('transfers.saveAs', { name: error.suggestedName }))) data.name = error.suggestedName;
              else throw new Error(t('transfers.skipped'));
              upload = (await api<{ id: string }>('/uploads', 'POST', { ...data, overwrite }, signal)).id;
            }
            save([...readSaved().filter((row) => row.id !== candidate?.id), { id: upload, fingerprint: mark, parentId: destination }]);
            existing = undefined;
          }
          task.upload = upload;
          if (signal.aborted) { await cancel(id); continue; }
          update(id, { state: t('transfers.uploading') });
          const parts = new Set(existing?.parts.map((part) => part.PartNumber));
          for (let start = 0, part = 1; existing?.state !== 'finished-object' && start < file.size; start += block, part++) {
            const end = Math.min(start + block, file.size);
            if (!parts.has(part)) await api('/uploads/' + upload + '/parts/' + part, 'PUT', file.slice(start, end), signal);
            update(id, { sent: end });
          }
          try { await api('/uploads/' + upload + '/complete', 'POST', { overwrite }, signal); }
          catch (error) {
            if (!(error instanceof ApiError) || !error.suggestedName || !window.confirm(t('transfers.nameExists'))) throw error;
            await api('/uploads/' + upload + '/complete', 'POST', { overwrite: true }, signal);
          }
          save(readSaved().filter((row) => row.id !== upload));
          update(id, { sent: file.size, state: t('transfers.completed') });
          refresh();
        } catch (error) {
          if (!signal.aborted) update(id, { state: t('transfers.interrupted'), error: message(error) });
        } finally {
          controls.current.delete(id);
        }
      }
    } finally { running.current = false; }
  }

  return { transfers, add, cancel };
}
