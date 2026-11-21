'use client';

import { useEffect, useMemo, useRef, useState, type DragEvent, type FormEvent } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { animate, stagger } from 'animejs';
import {
  ArrowLeft, ArrowUpFromLine, ChevronRight, Copy, Download, Eye, FileJson, Folder, FolderInput, FolderPlus,
  Grid2X2, HardDrive, Image as ImageIcon, ImageOff, Images, Link2, List, ListChecks, LogOut, PanelLeftClose,
  PanelLeftOpen, Pencil, RotateCcw, Search, Settings as SettingsIcon, Trash2, X, type LucideIcon,
} from 'lucide-react';
import { sileo } from 'sileo';
import { ApiError, api, content, gql } from '@/lib/api';
import { formatBytes, message } from '@/lib/format';
import { collectDroppedFiles } from '@/lib/dropped-files';
import { destinationQuery, driveQuery, previewQuery } from '@/graphql/entries';
import type { Entry, Page } from '@/types/entry';
import { Brand } from '@/components/brand';
import { FileVisual } from '@/components/file-visual';
import { Skeleton } from '@/components/skeleton';
import { MediaViewer } from '@/components/media-viewer';
import { Pagination } from '@/components/pagination';
import { RowMenu } from '@/components/row-menu';
import { Imports, LinkPanel, Settings } from './panels';
import { StoragePanel } from './storage';
import { drivePath, driveRouteFromPathname, type DriveRoute, type DriveView } from './routes';
import { TransferSummary, Transfers } from '@/components/transfers';
import { useTransfers } from '@/hooks/use-transfers';
import { useI18n } from '@/i18n/provider';

const sections = [
  { id: 'files', key: 'drive.section.files', icon: Folder },
  { id: 'gallery', key: 'drive.section.gallery', icon: Images },
  { id: 'trash', key: 'drive.section.trash', icon: Trash2 },
  { id: 'links', key: 'drive.section.links', icon: Link2 },
  { id: 'transfers', key: 'drive.section.transfers', icon: ArrowUpFromLine },
  { id: 'imports', key: 'drive.section.imports', icon: FileJson },
  { id: 'storage', key: 'drive.storage', icon: HardDrive },
  { id: 'settings', key: 'drive.section.settings', icon: SettingsIcon },
] as const satisfies readonly { id: DriveView; key: string; icon: LucideIcon }[];
type Operation = 'folder' | 'rename' | 'move' | 'copy' | 'restore' | 'purge' | 'share';
const operationKeys: Record<Operation, string> = {
  folder: 'drive.op.folder', rename: 'drive.op.rename', move: 'drive.op.move', copy: 'drive.op.copy',
  restore: 'drive.op.restore', purge: 'drive.op.purge', share: 'drive.op.share',
};
const operationIcons: Record<Operation, LucideIcon> = {
  folder: FolderPlus, rename: Pencil, move: FolderInput, copy: Copy,
  restore: RotateCcw, purge: Trash2, share: Link2,
};
const PAGE_SIZE = 24;
const isViewableMedia = (row: Entry) => {
  if (row.kind !== 'file') return false;
  if (row.mime.startsWith('audio/')) return true;
  return (row.mime.startsWith('image/') || row.mime.startsWith('video/')) && (row.mediaStatus === 'ready' || row.hasPreview);
};

export function DriveWorkspace({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const route = driveRouteFromPathname(pathname);
  return route ? <Drive route={route} /> : children;
}

function Drive({ route: { view, folderId } }: { route: DriveRoute }) {
  const router = useRouter();
  const cache = useQueryClient();
  const { t, locale } = useI18n();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  useEffect(() => { setSidebarOpen(localStorage.getItem('nuvex-sidebar') !== 'closed'); }, []);
  function toggleSidebar() {
    const next = !sidebarOpen;
    setSidebarOpen(next);
    localStorage.setItem('nuvex-sidebar', next ? 'open' : 'closed');
  }
  const [lastFolderPath, setLastFolderPath] = useState<Entry[]>([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('');
  const [sort, setSort] = useState('name');
  const [typeFilter, setTypeFilter] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [sizeFilter, setSizeFilter] = useState('');
  const [layout, setLayout] = useState<'list' | 'grid'>('list');
  const [selected, setSelected] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [preview, setPreview] = useState<Entry>();
  const [viewerId, setViewerId] = useState<string>();
  const [op, setOp] = useState<{ name: Operation; rows: Entry[] }>();
  const [share, setShare] = useState<{ id: string; code: string; path: string; qr?: string }>();
  const [sending, setSending] = useState(false);
  const [iconTarget, setIconTarget] = useState<string>();
  const [operationError, setOperationError] = useState('');
  const [suggested, setSuggested] = useState('');
  const [busy, setBusy] = useState(false);
  const [folderPage, setFolderPage] = useState(1);
  const [movePath, setMovePath] = useState<Entry[]>([]);
  const [restoreOriginal, setRestoreOriginal] = useState(true);
  const [draggingId, setDraggingId] = useState<string>();
  const [dropFolderId, setDropFolderId] = useState<string>();
  const [fileDragActive, setFileDragActive] = useState(false);
  const listing = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const folderPicker = useRef<HTMLInputElement>(null);
  const iconPicker = useRef<HTMLInputElement>(null);
  const filters = useMemo<{ kind?: string; mimePrefix?: string; from?: string; minSize?: string; maxSize?: string; active: boolean }>(() => {
    const kind = typeFilter === 'folder' ? 'folder' : typeFilter === 'file' ? 'file' : undefined;
    const mimePrefix = typeFilter === 'image' ? 'image/' : typeFilter === 'video' ? 'video/' : typeFilter === 'audio' ? 'audio/' : undefined;
    const days = dateFilter === 'week' ? 7 : dateFilter === 'month' ? 30 : dateFilter === 'year' ? 365 : 0;
    let from: string | undefined;
    if (days) {
      const date = new Date();
      date.setHours(0, 0, 0, 0);
      date.setDate(date.getDate() - days);
      from = date.toISOString();
    }
    const minSize = sizeFilter === 'medium' ? String(1024 ** 2) : sizeFilter === 'large' ? String(100 * 1024 ** 2) : undefined;
    const maxSize = sizeFilter === 'small' ? String(1024 ** 2 - 1) : sizeFilter === 'medium' ? String(100 * 1024 ** 2) : undefined;
    return { kind, mimePrefix, from, minSize, maxSize, active: Boolean(typeFilter || dateFilter || sizeFilter) };
  }, [typeFilter, dateFilter, sizeFilter]);
  const showListing = view === 'files' || view === 'gallery' || view === 'trash';
  const href = drivePath(view, folderId);
  const me = useQuery({ queryKey: ['me'], queryFn: () => api('/auth/me') });
  useEffect(() => {
    if (me.error instanceof ApiError && me.error.status === 401) {
      router.replace(href === '/drive' ? '/' : '/?' + new URLSearchParams({ next: href }));
    }
  }, [me.error, href, router]);
  const folderPath = useQuery({
    queryKey: ['folder-path', folderId],
    queryFn: async () => {
      const ancestors: Entry[] = [];
      const seen = new Set<string>();
      let id = folderId ?? '';
      while (id) {
        if (seen.has(id)) throw new ApiError(404, t('drive.folderUnavailable'));
        seen.add(id);
        const { entry } = await gql<{ entry: Entry }>(previewQuery, { id });
        if (entry.kind !== 'folder') throw new ApiError(404, t('drive.folderUnavailable'));
        ancestors.push(entry);
        id = entry.parentId;
      }
      return ancestors.reverse();
    },
    enabled: Boolean(me.data && folderId),
  });
  useEffect(() => {
    if (view !== 'files') return;
    if (!folderId) setLastFolderPath([]);
    else if (folderPath.data) setLastFolderPath(folderPath.data);
  }, [view, folderId, folderPath.data]);
  const path = view === 'files' ? (folderPath.data ?? []) : lastFolderPath;
  const parentId = view === 'files' ? (folderId ?? '') : (path.at(-1)?.id ?? '');
  const folderName = path.at(-1)?.name ?? t('drive.section.files');
  const folderReady = !folderId || Boolean(folderPath.data && !folderPath.isError);
  const entries = useInfiniteQuery({
    queryKey: ['entries', view, parentId, filter, sort, typeFilter, dateFilter, sizeFilter],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => gql<{ entries: Page }>(
      driveQuery,
      { view, parentId, search: filter, cursor: pageParam, limit: PAGE_SIZE, sort, kind: filters.kind, mimePrefix: filters.mimePrefix, from: filters.from, minSize: filters.minSize, maxSize: filters.maxSize },
    ).then((data) => data.entries),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: Boolean(me.data && showListing && folderReady),
    refetchInterval: 4500,
  });
  const quota = useQuery({ queryKey: ['quota'], queryFn: () => api<{ used: string; quota: string }>('/quota'), enabled: Boolean(me.data) });
  const previewDetails = useQuery({
    queryKey: ['preview', preview?.id],
    queryFn: () => gql<{ entry: Entry }>(previewQuery, { id: preview!.id }).then((data) => data.entry),
    enabled: Boolean(preview), refetchInterval: 3500,
  });
  const choosingFolder = Boolean(op && (['move', 'copy'].includes(op.name) || (op.name === 'restore' && !restoreOriginal)));
  const destination = movePath.at(-1)?.id ?? '';
  const destinations = useInfiniteQuery({
    queryKey: ['destinations', destination],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => gql<{ entries: Page }>(
      destinationQuery,
      { id: destination, cursor: pageParam },
    ).then((result) => result.entries),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: Boolean(me.data && choosingFolder),
  });
  const destinationPages = destinations.data?.pages.length ?? 0;
  const destinationIndex = Math.min(folderPage, Math.max(destinationPages, 1));
  const destinationRows = destinations.data?.pages[destinationIndex - 1]?.items ?? [];

  useEffect(() => {
    setSearch(''); setFilter(''); setTypeFilter(''); setDateFilter(''); setSizeFilter('');
    setViewerId(undefined); setPreview(undefined); setOp(undefined); setShare(undefined);
    setOperationError(''); setSuggested('');
  }, [view, folderId]);
  useEffect(() => {
    const timeout = window.setTimeout(() => setFilter(search), 220);
    return () => window.clearTimeout(timeout);
  }, [search]);
  useEffect(() => { setPage(1); setSelected([]); }, [view, parentId, filter, sort, typeFilter, dateFilter, sizeFilter]);
  useEffect(() => { setSelected([]); }, [page]);
  useEffect(() => { setFolderPage(1); }, [destination]);
  useEffect(() => {
    if (!listing.current || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const items = Array.from(listing.current.querySelectorAll('.entries article'));
    const animation = animate(items, { opacity: [0, 1], translateY: [6, 0], duration: 240, delay: stagger(26), ease: 'outQuad' });
    return () => { animation.revert(); };
  }, [view, layout, parentId, page, entries.data]);
  useEffect(() => {
    if (!dialog.current) return;
    if (op || preview) {
      if (!dialog.current.open) dialog.current.showModal();
    } else if (dialog.current.open) dialog.current.close();
  }, [op, preview]);

  const refresh = () => {
    void cache.invalidateQueries({ queryKey: ['entries'] });
    void cache.invalidateQueries({ queryKey: ['quota'] });
    void cache.invalidateQueries({ queryKey: ['storage-overview'] });
    void cache.invalidateQueries({ queryKey: ['destinations'] });
    void cache.invalidateQueries({ queryKey: ['folder-path'] });
  };
  const transfers = useTransfers(refresh, t);
  const allRows = entries.data?.pages.flatMap((item) => item.items) ?? [];
  const loadedPages = entries.data?.pages.length ?? 0;
  const pageIndex = Math.min(page, Math.max(loadedPages, 1));
  const rows = entries.data?.pages[pageIndex - 1]?.items ?? [];
  const mediaItems = allRows.filter(isViewableMedia);
  const viewerIndex = viewerId ? mediaItems.findIndex((item) => item.id === viewerId) : -1;
  const active = rows.filter((row) => selected.includes(row.id));
  const allSelected = rows.length > 0 && rows.every((row) => selected.includes(row.id));
  const detail = previewDetails.data ?? preview;
  const busyMedia = detail && ['processing', 'queued'].includes(detail.mediaStatus);
  const clearDialog = () => { setOp(undefined); setPreview(undefined); setShare(undefined); setOperationError(''); setSuggested(''); };
  function openOp(name: Operation, rows: Entry[] = []) {
    setMovePath(name === 'restore' ? [] : path);
    setRestoreOriginal(true);
    setSuggested('');
    setOperationError('');
    setOp({ name, rows });
  }
  async function goToPage(target: number) {
    if (target < 1 || target === pageIndex) return;
    if (target <= loadedPages) { setPage(target); return; }
    if (!entries.hasNextPage || entries.isFetchingNextPage) return;
    await entries.fetchNextPage();
    setPage(target);
  }
  async function goToFolderPage(target: number) {
    if (target < 1 || target === destinationIndex) return;
    if (target <= destinationPages) { setFolderPage(target); return; }
    if (!destinations.hasNextPage || destinations.isFetchingNextPage) return;
    await destinations.fetchNextPage();
    setFolderPage(target);
  }

  function openRow(row: Entry) {
    if (view === 'trash') return;
    if (isViewableMedia(row)) { setViewerId(row.id); return; }
    setPreview(row);
    setOperationError('');
  }
  function rowActions(row: Entry) {
    if (view === 'trash') return <>
      <button type="button" role="menuitem" className="row-menu-item" onClick={() => openOp('restore', [row])}>
        <RotateCcw size={16} /> {t('drive.op.restore')}
      </button>
      <button type="button" role="menuitem" className="row-menu-item danger-text" onClick={() => openOp('purge', [row])}>
        <Trash2 size={16} /> {t('drive.op.purge')}
      </button>
    </>;
    return <>
      {row.kind === 'folder'
        ? <Link role="menuitem" className="row-menu-item" href={drivePath('files', row.id)} prefetch={false}><Folder size={16} /> {t('drive.open')}</Link>
        : <button type="button" role="menuitem" className="row-menu-item" onClick={() => openRow(row)}><Eye size={16} /> {t('drive.open')}</button>}
      <button type="button" role="menuitem" className="row-menu-item" onClick={() => openOp('rename', [row])}>
        <Pencil size={16} /> {t('drive.op.rename')}
      </button>
      <button type="button" role="menuitem" className="row-menu-item" onClick={() => openOp('move', [row])}>
        <FolderInput size={16} /> {t('drive.op.move')}
      </button>
      <button type="button" role="menuitem" className="row-menu-item" onClick={() => openOp('copy', [row])}>
        <Copy size={16} /> {t('drive.op.copy')}
      </button>
      <button type="button" role="menuitem" className="row-menu-item" onClick={() => openOp('share', [row])}>
        <Link2 size={16} /> {t('drive.op.share')}
      </button>
      {row.kind === 'file'
        ? <a role="menuitem" className="row-menu-item" href={content(row.id)}><Download size={16} /> {t('drive.download')}</a>
        : <a role="menuitem" className="row-menu-item" href={'/api/v1/entries/' + row.id + '/archive'}><Download size={16} /> {t('drive.downloadFolder')}</a>}
      {row.kind === 'folder' && <>
        <button type="button" role="menuitem" className="row-menu-item" onClick={() => chooseIcon(row.id)}>
          <ImageIcon size={16} /> {t('drive.setIcon')}
        </button>
        {row.hasIcon && <button type="button" role="menuitem" className="row-menu-item" onClick={() => void removeIcon(row.id)}>
          <ImageOff size={16} /> {t('drive.removeIcon')}
        </button>}
      </>}
      <button type="button" role="menuitem" className="row-menu-item danger-text" onClick={() => void trashRows([row])}>
        <Trash2 size={16} /> {t('drive.moveToTrash')}
      </button>
    </>;
  }

  async function perform(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!op) return;
    const input = new FormData(event.currentTarget);
    const name = String(input.get('name') ?? '');
    setBusy(true);
    setOperationError('');
    setSuggested('');
    try {
      if (op.name === 'folder') {
        const created = await api<Entry>('/folders', 'POST', { name, parentId });
        const icon = input.get('icon');
        if (icon instanceof File && icon.size) await api('/entries/' + created.id + '/icon', 'POST', icon);
      }
      else if (op.name === 'share') {
        setShare(await api<{ id: string; code: string; path: string; qr?: string }>('/shares', 'POST', {
          entryId: op.rows[0].id, hours: Number(input.get('hours')), uses: Number(input.get('uses')),
          allowDownload: input.get('downloads') === 'on',
          maxDownloads: input.get('maxDownloads') ? Number(input.get('maxDownloads')) : undefined,
        }));
        void cache.invalidateQueries({ queryKey: ['links'] });
        return;
      } else {
        for (const row of op.rows) {
          const path = '/entries/' + row.id;
          if (op.name === 'purge') await api(path + '/purge', 'POST', { confirmed: true });
          else {
            const data = {
              ...(name.trim() ? { name } : {}),
              ...(choosingFolder ? { parentId: destination } : {}),
              ...(input.get('overwrite') === 'on' ? { overwrite: true } : {}),
            };
            if (op.name === 'rename' || op.name === 'move') await api(path, 'PATCH', data);
            else await api(path + '/' + op.name, 'POST', data);
          }
        }
      }
      clearDialog(); setSelected([]);
      sileo.success({ title: op.name === 'purge' ? t('drive.queuedDelete') : t('drive.changesSaved') });
    } catch (error) {
      setOperationError(message(error));
      if (error instanceof ApiError) setSuggested(error.suggestedName ?? '');
    } finally { setBusy(false); refresh(); }
  }

  function chooseIcon(id: string) { setIconTarget(id); iconPicker.current?.click(); }
  async function uploadIcon(files: FileList | null) {
    const file = files?.[0];
    const target = iconTarget;
    if (!file || !target) return;
    setIconTarget(undefined);
    try {
      await api('/entries/' + target + '/icon', 'POST', file);
      sileo.success({ title: t('drive.iconSaved') });
      void cache.invalidateQueries({ queryKey: ['entries'] });
    } catch (error) { sileo.error({ title: message(error) }); }
  }
  async function removeIcon(id: string) {
    try {
      await api('/entries/' + id + '/icon', 'DELETE');
      sileo.success({ title: t('drive.iconRemoved') });
      void cache.invalidateQueries({ queryKey: ['entries'] });
    } catch (error) { sileo.error({ title: message(error) }); }
  }

  async function sendShare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!share) return;
    const to = String(new FormData(event.currentTarget).get('email') ?? '');
    setSending(true);
    try {
      await api('/shares/' + share.id + '/send', 'POST', { to, code: share.code });
      sileo.success({ title: t('drive.shareEmailSent') });
    } catch (error) { sileo.error({ title: message(error) }); }
    finally { setSending(false); }
  }

  async function trashRows(targets: Entry[]) {
    if (!targets.length) return;
    try {
      for (const row of targets) await api('/entries/' + row.id, 'DELETE');
      setSelected([]);
      sileo.success({ title: t('drive.trashed') });
    } catch (error) { sileo.error({ title: message(error) }); }
    finally { refresh(); }
  }
  function trash() { return trashRows(active); }

  function startRowDrag(event: DragEvent<HTMLElement>, row: Entry) {
    if (view === 'trash') return;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('application/x-nuvex-entry', row.id);
    setDraggingId(row.id);
  }
  function endRowDrag() {
    setDraggingId(undefined);
    setDropFolderId(undefined);
  }
  function overFolder(event: DragEvent<HTMLElement>, row: Entry) {
    if (view === 'trash' || row.kind !== 'folder' || !draggingId || row.id === draggingId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    if (dropFolderId !== row.id) setDropFolderId(row.id);
  }
  function leaveFolder(_event: DragEvent<HTMLElement>, row: Entry) {
    if (dropFolderId === row.id) setDropFolderId(undefined);
  }
  async function dropOnFolder(event: DragEvent<HTMLElement>, folder: Entry) {
    if (view === 'trash' || folder.kind !== 'folder') return;
    event.preventDefault();
    event.stopPropagation();
    const id = event.dataTransfer.getData('application/x-nuvex-entry') || draggingId;
    setDraggingId(undefined);
    setDropFolderId(undefined);
    if (!id || id === folder.id) return;
    try {
      await api('/entries/' + id, 'PATCH', { parentId: folder.id });
      setSelected([]);
      sileo.success({ title: t('drive.moved') });
      refresh();
    } catch (error) { sileo.error({ title: message(error) }); }
  }
  function workspaceDragOver(event: DragEvent<HTMLElement>) {
    if (!event.dataTransfer.types.includes('Files')) return;
    event.preventDefault();
    if (view !== 'trash' && folderReady && !fileDragActive) setFileDragActive(true);
  }
  function workspaceDragLeave(event: DragEvent<HTMLElement>) {
    const next = event.relatedTarget as Node | null;
    if (next && event.currentTarget.contains(next)) return;
    setFileDragActive(false);
  }
  function workspaceDrop(event: DragEvent<HTMLElement>) {
    if (!event.dataTransfer.types.includes('Files')) return;
    event.preventDefault();
    setFileDragActive(false);
    if (view === 'trash' || !folderReady) return;
    void collectDroppedFiles(event.dataTransfer).then((files) => {
      if (files.length) transfers.add(files, parentId);
    });
  }

  if (!me.data) return <main className="session-check"><Brand /><p role={me.error ? 'alert' : 'status'}>{me.error ? message(me.error) : t('drive.opening')}</p></main>;

  return <main className={'drive' + (sidebarOpen ? '' : ' sidebar-collapsed')}>
    <aside className="sidebar">
      <Link href={drivePath('files')} className="brand-button"><Brand /></Link>
      <nav aria-label="Drive">
        {sections.map(({ id, key, icon: Icon }) => <Link key={id} href={drivePath(id, lastFolderPath.at(-1)?.id)}
          className={view === id ? 'nav-active' : ''} aria-current={view === id ? 'page' : undefined}>
          <Icon size={17} /> <span>{t(key)}</span>
        </Link>)}
      </nav>
      <div className="sidebar-bottom">
        <div className="storage"><HardDrive size={15} /> <span>{t('drive.storage')}</span>
          <progress aria-label={t('drive.quotaAria')} value={Number(quota.data?.used ?? 0)} max={Number(quota.data?.quota ?? 1)} />
          <small>{quota.isPending ? <Skeleton width={110} height={10} /> : t('drive.quotaUsed', { used: formatBytes(quota.data?.used ?? 0, locale), quota: formatBytes(quota.data?.quota ?? 0, locale) })}</small>
        </div>
        <button className="text-button" onClick={async () => {
          try { await api('/auth/logout', 'POST'); cache.clear(); router.replace('/'); }
          catch (error) { sileo.error({ title: message(error) }); }
        }}><LogOut size={16} /> {t('drive.logout')}</button>
      </div>
    </aside>
    <section className="workspace" onDragOver={workspaceDragOver} onDragLeave={workspaceDragLeave} onDrop={workspaceDrop}>
      {fileDragActive && view !== 'trash' && <div className="drop-overlay" aria-hidden="true"><ArrowUpFromLine size={26} /><span>{t('drive.dropToUpload')}</span></div>}
      <header className="topbar">
        <div className="topbar-inner">
          <div className="topbar-left">
            <button className="icon-button" aria-label={t('drive.toggleSidebar')} title={t('drive.toggleSidebar')} onClick={toggleSidebar}>
              {sidebarOpen ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
            </button>
            <div className="breadcrumbs"><span>Drive</span><ChevronRight size={14} /><span>{t(sections.find((item) => item.id === view)?.key ?? '')}</span></div>
          </div>
          <div className="topbar-tools">
            {showListing && <label className="search"><Search size={17} /><input type="search" aria-label={t('drive.searchAria')} placeholder={t('drive.searchPlaceholder')} value={search} onChange={(event) => { setSearch(event.target.value); setSelected([]); }} /></label>}
            <TransferSummary transfers={transfers.transfers} open={() => router.push(drivePath('transfers'))} />
          </div>
        </div>
      </header>
      <div className="workspace-body">
        <header className="workspace-heading">
          <div>
            {folderId && <Link className="text-button back" href={drivePath('files', path.at(-2)?.id)}><ArrowLeft size={16} /> {path.at(-2)?.name ?? t('drive.section.files')}</Link>}
            <h1>{folderId
              ? (folderReady ? folderName : t(folderPath.isError ? 'drive.folderUnavailable' : 'drive.folderOpening'))
              : t(sections.find((item) => item.id === view)?.key ?? '')}</h1>
          </div>
          <div className="actions">
            {view === 'files' && folderReady && <>
              <button className="secondary" onClick={() => openOp('folder')}><FolderPlus size={17} /> {t('drive.op.folder')}</button>
              <button className="secondary" onClick={() => folderPicker.current?.click()}>{t('drive.uploadFolder')}</button>
              <button className="primary" onClick={() => picker.current?.click()}><ArrowUpFromLine size={17} /> {t('drive.uploadFiles')}</button>
            </>}
          </div>
        </header>
        <input ref={picker} type="file" hidden multiple onChange={(event) => {
          const files = Array.from(event.currentTarget.files ?? []); event.currentTarget.value = '';
          transfers.add(files, parentId);
        }} />
        <input ref={(element) => { folderPicker.current = element; element?.setAttribute('webkitdirectory', ''); }} type="file" hidden multiple onChange={(event) => {
          const files = Array.from(event.currentTarget.files ?? []); event.currentTarget.value = '';
          transfers.add(files, parentId);
        }} />
        <input ref={iconPicker} type="file" accept="image/*" hidden onChange={(event) => {
          const files = event.currentTarget.files; event.currentTarget.value = '';
          void uploadIcon(files);
        }} />
        {folderId && folderPath.isError && <div className="panel stack">
          <p className="error" role="alert">{message(folderPath.error)}</p>
          <Link className="secondary" href={drivePath('files')}>{t('drive.section.files')}</Link>
        </div>}
        {showListing && folderReady && <div ref={listing}>
          <div className="listing-tools">
            <span>{active.length ? t(active.length === 1 ? 'drive.selectedOne' : 'drive.selectedOther', { count: active.length }) : filter ? t('drive.resultsFor', { query: filter }) : t('drive.content')}</span>
            <div className="actions">
              <select aria-label={t('drive.filterTypeAria')} value={typeFilter} onChange={(event) => { setTypeFilter(event.target.value); setSelected([]); }}>
                <option value="">{t('drive.filterTypeAll')}</option>
                <option value="folder">{t('drive.folder')}</option>
                <option value="file">{t('drive.filterFile')}</option>
                <option value="image">{t('drive.filterImage')}</option>
                <option value="video">{t('drive.filterVideo')}</option>
                <option value="audio">{t('drive.filterAudio')}</option>
              </select>
              <select aria-label={t('drive.filterDateAria')} value={dateFilter} onChange={(event) => { setDateFilter(event.target.value); setSelected([]); }}>
                <option value="">{t('drive.filterDateAny')}</option>
                <option value="week">{t('drive.filterDateWeek')}</option>
                <option value="month">{t('drive.filterDateMonth')}</option>
                <option value="year">{t('drive.filterDateYear')}</option>
              </select>
              <select aria-label={t('drive.filterSizeAria')} value={sizeFilter} onChange={(event) => { setSizeFilter(event.target.value); setSelected([]); }}>
                <option value="">{t('drive.filterSizeAny')}</option>
                <option value="small">{t('drive.filterSizeSmall')}</option>
                <option value="medium">{t('drive.filterSizeMedium')}</option>
                <option value="large">{t('drive.filterSizeLarge')}</option>
              </select>
              {filters.active && <button type="button" className="text-button" onClick={() => { setTypeFilter(''); setDateFilter(''); setSizeFilter(''); }}>{t('drive.filterClear')}</button>}
              <select aria-label={t('drive.sortAria')} value={sort} onChange={(event) => setSort(event.target.value)}>
                <option value="name">{t('drive.sortName')}</option><option value="recent">{t('drive.sortRecent')}</option><option value="size">{t('drive.sortSize')}</option>
              </select>
              <div className="view-toggle">
                <button className="icon-button" aria-label={t('drive.viewList')} aria-pressed={layout === 'list'} onClick={() => setLayout('list')}><List size={17} /></button>
                <button className="icon-button" aria-label={t('drive.viewGrid')} aria-pressed={layout === 'grid'} onClick={() => setLayout('grid')}><Grid2X2 size={16} /></button>
              </div>
            </div>
          </div>
          {active.length > 0 && <div className="selection actions">
            <button type="button" className="icon-button" aria-label={t('drive.clearSelection')} title={t('drive.clearSelection')}
              onClick={() => setSelected([])}><X size={17} /></button>
            {!allSelected && <button type="button" className="icon-button" aria-label={t('drive.selectAll')} title={t('drive.selectAll')}
              onClick={() => setSelected(rows.map((row) => row.id))}><ListChecks size={17} /></button>}
            {(view === 'trash' ? ['restore', 'purge'] as const : ['rename', 'move', 'copy', 'share'] as const).map((action) => {
              if (['rename', 'share'].includes(action) && active.length !== 1) return null;
              const Icon = operationIcons[action];
              const label = t(operationKeys[action]);
              return <button type="button" key={action} className={action === 'purge' ? 'icon-button danger' : 'icon-button'}
                aria-label={label} title={label} onClick={() => openOp(action, active)}><Icon size={17} /></button>;
            })}
            {view !== 'trash' && <button type="button" className="icon-button" aria-label={t('drive.moveToTrash')} title={t('drive.moveToTrash')}
              onClick={() => void trash()}><Trash2 size={17} /></button>}
            {view !== 'trash' && active.length === 1 && active[0].kind === 'file' && <a className="icon-button" href={content(active[0].id)}
              aria-label={t('drive.download')} title={t('drive.download')}><Download size={17} /></a>}
            {view !== 'trash' && active.length === 1 && active[0].kind === 'folder' && <a className="icon-button"
              href={'/api/v1/entries/' + active[0].id + '/archive'} aria-label={t('drive.downloadFolder')} title={t('drive.downloadFolder')}><Download size={17} /></a>}
            {view !== 'trash' && active.length === 1 && active[0].kind === 'folder' && <>
              <button type="button" className="icon-button" aria-label={t('drive.setIcon')} title={t('drive.setIcon')}
                onClick={() => chooseIcon(active[0].id)}><ImageIcon size={17} /></button>
              {active[0].hasIcon && <button type="button" className="icon-button" aria-label={t('drive.removeIcon')} title={t('drive.removeIcon')}
                onClick={() => void removeIcon(active[0].id)}><ImageOff size={17} /></button>}
            </>}
          </div>}
          {entries.error && <p className="error" role="alert">{message(entries.error)}</p>}
          {entries.isPending && <div className="skeleton-list" aria-hidden="true">
            {Array.from({ length: 6 }).map((_, index) => (
              <div className="skeleton-row" key={index}>
                <Skeleton width={36} height={36} rounded={7} />
                <span className="skeleton-lines"><Skeleton width="38%" /><Skeleton width="22%" height={10} /></span>
              </div>
            ))}
          </div>}
          {entries.isSuccess && !allRows.length && <div className="empty">
            <div className="empty-icon">{view === 'trash' ? <Trash2 /> : view === 'gallery' ? <Images /> : <Folder />}</div>
            <h2>{filter ? t('drive.emptyNoResults') : view === 'trash' ? t('drive.emptyTrash') : view === 'gallery' ? t('drive.emptyGallery') : t('drive.emptyFolder')}</h2>
            {view === 'files' && !filter && <p>{t('drive.emptyHint')}</p>}
          </div>}
          {rows.length > 0 && <div className={'entries ' + (layout === 'grid' || view === 'gallery' ? 'grid-view' : 'list-view')}>
            {rows.map((row) => {
              const label = <>
                <FileVisual row={row} />
                <span><strong title={row.name}>{row.name}</strong><small>{row.kind === 'folder' ? t('drive.folder') : formatBytes(row.size, locale)}{row.mediaStatus === 'failed' ? ' · ' + t('drive.mediaFailed') : ''}</small></span>
              </>;
              return <article key={row.id}
                className={[selected.includes(row.id) ? 'row-selected' : '', draggingId === row.id ? 'row-dragging' : '', dropFolderId === row.id ? 'row-drop' : ''].filter(Boolean).join(' ')}
                draggable={view !== 'trash'}
                onDragStart={(event) => startRowDrag(event, row)}
                onDragEnd={endRowDrag}
                onDragOver={(event) => overFolder(event, row)}
                onDragLeave={(event) => leaveFolder(event, row)}
                onDrop={(event) => void dropOnFolder(event, row)}>
                <input type="checkbox" aria-label={t('drive.selectAria', { name: row.name })} checked={selected.includes(row.id)} onChange={(event) =>
                  setSelected(event.target.checked ? [...selected, row.id] : selected.filter((id) => id !== row.id))} />
                {row.kind === 'folder' && view !== 'trash'
                  ? <Link className="entry-button" href={drivePath('files', row.id)} prefetch={false}>{label}</Link>
                  : <button className="entry-button" onClick={() => openRow(row)} disabled={view === 'trash'}>{label}</button>}
                <time dateTime={row.updatedAt}>{new Date(row.updatedAt).toLocaleDateString(locale)}</time>
                <RowMenu label={t('drive.rowActions')}>{rowActions(row)}</RowMenu>
              </article>;
            })}
          </div>}
          <Pagination page={pageIndex} pages={loadedPages} hasNext={Boolean(entries.hasNextPage)}
            busy={entries.isFetchingNextPage} onSelect={(target) => void goToPage(target)} />
        </div>}
        {view === 'transfers' && <div className="panel-column"><Transfers transfers={transfers.transfers} cancel={transfers.cancel} retry={transfers.retry} /></div>}
        {view === 'imports' && <div className="panel-column"><Imports parentId={parentId} folderName={folderName} /></div>}
        {view === 'links' && <div className="panel-column"><LinkPanel /></div>}
        {view === 'storage' && <StoragePanel openTrash={() => router.push(drivePath('trash'))} />}
        {view === 'settings' && <Settings />}
      </div>
    </section>
    <dialog ref={dialog} onCancel={(event) => { if (busy) event.preventDefault(); else clearDialog(); }} onClose={clearDialog} aria-labelledby="dialog-title">
      <div className="dialog-inner">
        <button className="icon-button dialog-close" aria-label={t('drive.close')} disabled={busy} onClick={clearDialog}><X size={20} /></button>
        {op && <><h2 id="dialog-title">{t(operationKeys[op.name])}</h2>
          {share ? <div className="stack">
            <label htmlFor="share-link">{t('drive.shareLink')}</label><input id="share-link" readOnly value={location.origin + share.path} />
            <label htmlFor="share-code">{t('drive.shareCode')}</label><input id="share-code" readOnly value={share.code} />
            <p>{t('drive.shareHint')}</p>
            {share.qr && <img className="share-qr" src={share.qr} alt={t('drive.shareQrAlt')} width={160} height={160} />}
            <form className="settings-form" onSubmit={sendShare}>
              <label htmlFor="share-email">{t('drive.shareEmailLabel')}</label>
              <input id="share-email" name="email" type="email" required maxLength={200} autoComplete="off" />
              <button className="secondary" disabled={sending}>{t('drive.shareEmailSend')}</button>
            </form>
          </div> : <form className="stack" onSubmit={perform}>
            {(op.name === 'folder' || op.name === 'rename' || ((choosingFolder || op.name === 'restore') && op.rows.length === 1)) &&
              <><label htmlFor="operation-name">{t('drive.name')}</label><input id="operation-name" key={suggested || op.name} name="name" defaultValue={suggested || op.rows[0]?.name || ''} required maxLength={200} /></>}
            {op.name === 'folder' && <>
              <label htmlFor="folder-icon">{t('drive.folderIcon')}</label>
              <input id="folder-icon" name="icon" type="file" accept="image/*" />
            </>}
            {op.name === 'restore' && <label><input type="checkbox" checked={restoreOriginal} onChange={(event) => setRestoreOriginal(event.target.checked)} /> {t('drive.restoreOriginal')}</label>}
            {choosingFolder && <div className="folder-picker">
              <div className="actions"><strong>{movePath.at(-1)?.name ?? t('drive.section.files')}</strong>{movePath.length > 0 && <button type="button" className="text-button" onClick={() => setMovePath(movePath.slice(0, -1))}>{t('drive.upOneLevel')}</button>}</div>
              {destinations.error && <p className="error">{message(destinations.error)}</p>}
              {destinationRows.filter((row) => row.kind === 'folder' && !op.rows.some((entry) => entry.id === row.id)).map((row) =>
                <button className="secondary" type="button" key={row.id} onClick={() => setMovePath([...movePath, row])}><Folder size={16} /> {row.name}</button>)}
              <Pagination page={destinationIndex} pages={destinationPages} hasNext={Boolean(destinations.hasNextPage)}
                busy={destinations.isFetchingNextPage} onSelect={(target) => void goToFolderPage(target)} />
            </div>}
            {op.name === 'share' && <>
              <label htmlFor="share-hours">{t('drive.shareHours')}</label><input name="hours" id="share-hours" type="number" min="1" max="720" defaultValue="24" required />
              <label htmlFor="share-uses">{t('drive.shareUses')}</label><input name="uses" id="share-uses" type="number" min="1" max="100" defaultValue="1" required />
              <label><input type="checkbox" name="downloads" /> {t('drive.allowDownloads')}</label>
              <label htmlFor="share-max-downloads">{t('drive.shareMaxDownloads')}</label>
              <input name="maxDownloads" id="share-max-downloads" type="number" min="1" max="10000" placeholder={t('drive.shareMaxDownloadsPlaceholder')} />
            </>}
            {op.name === 'purge' && <p>{t(op.rows.length === 1 ? 'drive.purgeConfirmOne' : 'drive.purgeConfirmOther', { count: op.rows.length })}</p>}
            {!!suggested && ['move', 'rename', 'restore'].includes(op.name) && <label><input type="checkbox" name="overwrite" /> {t('drive.overwrite')}</label>}
            {operationError && <p className="error" role="alert">{operationError}</p>}
            <button className={op.name === 'purge' ? 'danger' : 'primary'} disabled={busy}>{busy ? t('drive.processing') : t(operationKeys[op.name])}</button>
          </form>}
        </>}
        {detail && <div className="preview">
          <h2 id="dialog-title">{detail.name}</h2>
          {detail.mime.startsWith('image/') && detail.mediaStatus === 'ready' && <img src={content(detail.id, 'preview')} alt={detail.name} />}
          {detail.mime.startsWith('video/') && detail.mediaStatus === 'ready' && <video src={content(detail.id, 'preview')} controls playsInline preload="metadata" />}
          {busyMedia && <p role="status">{t('drive.preparing')}</p>}
          {detail.mediaStatus === 'none' && <p>{t('drive.downloadable')}</p>}
          {detail.mediaStatus === 'failed' && <p>{t('drive.previewFailed')}</p>}
          {operationError && <p className="error" role="alert">{operationError}</p>}
          <div className="actions">
            <a className="secondary" href={content(detail.id)}><Download size={16} /> {t('drive.downloadOriginal')}</a>
            {['failed', 'needs-transcode'].includes(detail.mediaStatus) && <button className="primary" onClick={async () => {
              try { await api('/entries/' + detail.id + '/process' + (detail.mime.startsWith('video/') ? '?video=1' : ''), 'POST'); await previewDetails.refetch(); }
              catch (error) { setOperationError(message(error)); }
            }}>{detail.mediaStatus === 'failed' ? t('drive.retryPreview') : t('drive.prepareVideo')}</button>}
          </div>
        </div>}
      </div>
    </dialog>
    {viewerId && viewerIndex >= 0 && <MediaViewer items={mediaItems} index={viewerIndex}
      onClose={() => setViewerId(undefined)}
      onIndexChange={(index) => setViewerId(mediaItems[index]?.id)}
      hasNextPage={Boolean(entries.hasNextPage)}
      onNeedMore={() => { if (entries.hasNextPage && !entries.isFetchingNextPage) void entries.fetchNextPage(); }} />}
  </main>;
}
