'use client';

import { useState, type FormEvent } from 'react';
import { useParams } from 'next/navigation';
import { useInfiniteQuery } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Download, File, Folder, LockKeyhole } from 'lucide-react';
import { Brand } from '@/components/brand';
import { Pagination } from '@/components/pagination';
import { ApiError, api } from '@/lib/api';
import { formatBytes, message } from '@/lib/format';
import type { Entry, Page } from '@/types/entry';
import { useI18n } from '@/i18n/provider';

type SharePage = Page & { rootId: string; entry: Entry; expiresAt: string; allowDownload: boolean };
const PAGE_SIZE = 24;

export default function SharePageView() {
  const { shareId } = useParams<{ shareId: string }>();
  const { t, locale } = useI18n();
  const scope = '/guest/' + encodeURIComponent(shareId);
  const [path, setPath] = useState<Entry[]>([]);
  const [page, setPage] = useState(1);
  const [preview, setPreview] = useState<Entry>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const query = useInfiniteQuery({
    queryKey: ['guest', shareId, path.at(-1)?.id], initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams();
      const entry = path.at(-1)?.id;
      if (entry) params.set('entry', entry);
      if (pageParam) params.set('cursor', pageParam);
      params.set('limit', String(PAGE_SIZE));
      return api<SharePage>(scope + '?' + params);
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    refetchInterval: 5000,
  });
  const data = query.data?.pages[0];
  const loaded = query.data?.pages ?? [];
  const pages = Math.max(loaded.length, 1);
  const current = Math.min(page, pages);
  const rows = data?.entry.kind === 'file' ? [data.entry] : loaded[current - 1]?.items ?? [];
  async function goToPage(target: number) {
    if (target < 1 || target === current) return;
    if (target <= pages) { setPage(target); return; }
    if (!query.hasNextPage || query.isFetchingNextPage) return;
    await query.fetchNextPage();
    setPage(target);
  }
  const fileUrl = (row: Entry, mode: string) => '/api/v1' + scope + '/content/' + row.id + '?mode=' + mode;
  async function redeem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = new FormData(event.currentTarget).get('code');
    setBusy(true); setError('');
    try { await api(scope + '/redeem', 'POST', { code }); await query.refetch(); }
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
      {query.isPending && <p role="status">{t('guest.checking')}</p>}
      {!data && query.error && (!(query.error instanceof ApiError) || query.error.status !== 403) && <p className="error" role="alert">{message(query.error)}</p>}
      {!data && query.error instanceof ApiError && query.error.status === 403 && <>
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
      {data && !query.error && <>
        {path.length > 0 && <button className="text-button" onClick={() => { setPath(path.slice(0, -1)); setPage(1); setPreview(undefined); setError(''); }}><ArrowLeft size={16} /> {t('guest.back')}</button>}
        <h1>{data.entry.name}</h1>
        <p>{t('guest.accessUntil', { time: new Date(data.expiresAt).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }) })}</p>
        {error && <p className="error" role="status">{error}</p>}
        {data.entry.kind === 'folder' && !loaded.some((item) => item.items.length) && <p>{t('guest.folderEmpty')}</p>}
        {rows.map((row) => <article className="transfer" key={row.id}>
          <div className="actions">{row.kind === 'folder' ? <Folder size={18} /> : <File size={18} />}<strong>{row.name}</strong>{row.kind === 'file' && <small>{formatBytes(row.size, locale)}</small>}</div>
          <div className="actions">
            {row.kind === 'folder' && <button className="secondary" onClick={() => { setPreview(undefined); setError(''); setPath([...path, row]); setPage(1); }}>{t('guest.openFolder')}</button>}
            {row.kind === 'file' && (row.mime.startsWith('image/') || row.mime.startsWith('video/')) && <button className="secondary" disabled={busy} onClick={() => void prepare(row)}>{preview?.id === row.id && !ready ? t('guest.checkPreview') : t('guest.preview')}</button>}
            {data.allowDownload && row.kind === 'file' && <a className="secondary" href={fileUrl(row, 'download')}><Download size={16} /> {t('guest.download')}</a>}
          </div>
        </article>)}
        <Pagination page={current} pages={pages} hasNext={Boolean(query.hasNextPage)}
          busy={query.isFetchingNextPage} onSelect={(target) => void goToPage(target)} />
        {ready && preview && <div className="preview">
          {preview.mime.startsWith('video/') ? <video src={fileUrl(preview, 'preview')} controls preload="metadata" playsInline /> : <img src={fileUrl(preview, 'preview')} alt={preview.name} />}
        </div>}
      </>}
      {data && query.error && <p className="error" role="alert">{message(query.error)}</p>}
    </section>
  </main>;
}
