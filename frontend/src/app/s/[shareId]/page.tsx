'use client';

import { useState, type FormEvent } from 'react';
import { useParams } from 'next/navigation';
import { useInfiniteQuery } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Download, File, Folder, LockKeyhole } from 'lucide-react';
import { Brand } from '@/components/brand';
import { ApiError, api } from '@/lib/api';
import { formatBytes, message } from '@/lib/format';
import type { Entry, Page } from '@/types/entry';
import { useI18n } from '@/i18n/provider';

type SharePage = Page & { rootId: string; entry: Entry; expiresAt: string; allowDownload: boolean };

export default function SharePageView() {
  const { shareId } = useParams<{ shareId: string }>();
  const { t, locale } = useI18n();
  const scope = '/guest/' + encodeURIComponent(shareId);
  const [path, setPath] = useState<Entry[]>([]);
  const [preview, setPreview] = useState<Entry>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const page = useInfiniteQuery({
    queryKey: ['guest', shareId, path.at(-1)?.id], initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => {
      const query = new URLSearchParams();
      const entry = path.at(-1)?.id;
      if (entry) query.set('entry', entry);
      if (pageParam) query.set('cursor', pageParam);
      return api<SharePage>(scope + '?' + query);
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    refetchInterval: 5000,
  });
  const data = page.data?.pages[0];
  const fileUrl = (row: Entry, mode: string) => '/api/v1' + scope + '/content/' + row.id + '?mode=' + mode;
  async function redeem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = new FormData(event.currentTarget).get('code');
    setBusy(true); setError('');
    try { await api(scope + '/redeem', 'POST', { code }); await page.refetch(); }
    catch (error) { setError(message(error)); }
    finally { setBusy(false); }
  }
  async function prepare(row: Entry) {
    setPreview(row); setReady(false); setError(''); setBusy(true);
    try {
      const response = await api<{ ready: boolean; error?: string }>(scope + '/preview/' + row.id, 'POST');
      if (response.error) throw new Error(response.error);
      setReady(response.ready);
      if (!response.ready) setError(t('guest.previewPending'));
    } catch (error) { setError(message(error)); }
    finally { setBusy(false); }
  }
  return <main className="guest">
    <header><Brand /></header>
    <section className="panel guest-panel">
      {page.isPending && <p role="status">{t('guest.checking')}</p>}
      {!data && page.error && (!(page.error instanceof ApiError) || page.error.status !== 403) && <p className="error" role="alert">{message(page.error)}</p>}
      {!data && page.error instanceof ApiError && page.error.status === 403 && <>
        <div className="login-icon"><LockKeyhole size={20} /></div>
        <h1>{t('guest.title')}</h1>
        <p>{t('guest.hint')}</p>
        <form className="stack" onSubmit={redeem}>
          <label htmlFor="guest-code">{t('guest.code')}</label>
          <input id="guest-code" name="code" required minLength={6} maxLength={32} spellCheck={false} autoComplete="one-time-code" />
          {error && <p className="error" role="alert">{error}</p>}
          <button className="primary" disabled={busy}>{t('guest.open')} <ArrowRight size={16} /></button>
        </form>
      </>}
      {data && !page.error && <>
        {path.length > 0 && <button className="text-button" onClick={() => { setPath(path.slice(0, -1)); setPreview(undefined); setError(''); }}><ArrowLeft size={16} /> {t('guest.back')}</button>}
        <h1>{data.entry.name}</h1>
        <p>{t('guest.accessUntil', { time: new Date(data.expiresAt).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }) })}</p>
        {error && <p className="error" role="status">{error}</p>}
        {data.entry.kind === 'folder' && !(page.data?.pages.some((item) => item.items.length)) && <p>{t('guest.folderEmpty')}</p>}
        {(data.entry.kind === 'file' ? [data.entry] : page.data?.pages.flatMap((item) => item.items) ?? []).map((row) => <article className="transfer" key={row.id}>
          <div className="actions">{row.kind === 'folder' ? <Folder size={18} /> : <File size={18} />}<strong>{row.name}</strong>{row.kind === 'file' && <small>{formatBytes(row.size, locale)}</small>}</div>
          <div className="actions">
            {row.kind === 'folder' && <button className="secondary" onClick={() => { setPreview(undefined); setError(''); setPath([...path, row]); }}>{t('guest.openFolder')}</button>}
            {row.kind === 'file' && (row.mime.startsWith('image/') || row.mime.startsWith('video/')) && <button className="secondary" disabled={busy} onClick={() => void prepare(row)}>{preview?.id === row.id && !ready ? t('guest.checkPreview') : t('guest.preview')}</button>}
            {data.allowDownload && row.kind === 'file' && <a className="secondary" href={fileUrl(row, 'download')}><Download size={16} /> {t('guest.download')}</a>}
          </div>
        </article>)}
        {page.hasNextPage && <button className="secondary more" onClick={() => void page.fetchNextPage()}>{t('guest.loadMore')}</button>}
        {ready && preview && <div className="preview">
          {preview.mime.startsWith('video/') ? <video src={fileUrl(preview, 'preview')} controls preload="metadata" playsInline /> : <img src={fileUrl(preview, 'preview')} alt={preview.name} />}
        </div>}
      </>}
      {data && page.error && <p className="error" role="alert">{message(page.error)}</p>}
    </section>
  </main>;
}
