'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Download, RotateCcw, X, ZoomIn, ZoomOut } from 'lucide-react';
import { api, content, gql } from '@/lib/api';
import { message } from '@/lib/format';
import { previewQuery } from '@/graphql/entries';
import type { Entry } from '@/types/entry';
import { useI18n } from '@/i18n/provider';

type Props = {
  items: Entry[];
  index: number;
  onClose: () => void;
  onIndexChange: (index: number) => void;
  hasNextPage?: boolean;
  onNeedMore?: () => void;
};

export function MediaViewer({ items, index, onClose, onIndexChange, hasNextPage = false, onNeedMore }: Props) {
  const { t } = useI18n();
  const [zoom, setZoom] = useState(false);
  const [error, setError] = useState('');
  const overlay = useRef<HTMLDivElement>(null);
  const startX = useRef<number | undefined>(undefined);
  const current = items[index];

  const details = useQuery({
    queryKey: ['viewer', current?.id],
    queryFn: () => gql<{ entry: Entry }>(previewQuery, { id: current!.id }).then((data) => data.entry),
    enabled: Boolean(current),
    refetchInterval: (query) => {
      const status = (query.state.data as Entry | undefined)?.mediaStatus;
      return status === 'queued' || status === 'processing' ? 2500 : false;
    },
  });
  const entry = details.data ?? current;
  const isVideo = Boolean(entry?.mime.startsWith('video/'));
  const isImage = Boolean(entry?.mime.startsWith('image/'));
  const imageReady = Boolean(entry && (entry.mediaStatus === 'ready' || entry.hasPreview));
  const videoReady = entry?.mediaStatus === 'ready';
  const needsAction = Boolean(entry && ['failed', 'needs-transcode'].includes(entry.mediaStatus));

  const go = useCallback((delta: number) => {
    const next = index + delta;
    if (next < 0 || next >= items.length) return;
    setZoom(false);
    setError('');
    onIndexChange(next);
  }, [index, items.length, onIndexChange]);

  useEffect(() => { setZoom(false); setError(''); }, [current?.id]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      else if (event.key === 'ArrowRight') go(1);
      else if (event.key === 'ArrowLeft') go(-1);
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    overlay.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [go, onClose]);

  useEffect(() => {
    if (hasNextPage && index >= items.length - 2) onNeedMore?.();
  }, [hasNextPage, index, items.length, onNeedMore]);

  async function retry() {
    if (!entry) return;
    setError('');
    try {
      await api('/entries/' + entry.id + '/process' + (isVideo ? '?video=1' : ''), 'POST');
      await details.refetch();
    } catch (failure) { setError(message(failure)); }
  }

  if (!entry) return null;

  return <div className="lightbox" role="dialog" aria-modal="true" aria-label={entry.name} tabIndex={-1}
    ref={overlay}
    onTouchStart={(event) => { startX.current = event.touches[0]?.clientX; }}
    onTouchEnd={(event) => {
      if (startX.current === undefined) return;
      const delta = (event.changedTouches[0]?.clientX ?? startX.current) - startX.current;
      if (Math.abs(delta) > 50) go(delta < 0 ? 1 : -1);
      startX.current = undefined;
    }}>
    <header className="lightbox-bar">
      <button type="button" className="icon-button" aria-label={t('drive.close')} title={t('drive.close')} onClick={onClose}><X size={20} /></button>
      <span className="lightbox-title" title={entry.name}>{entry.name}</span>
      <div className="actions">
        {isImage && <button type="button" className="icon-button" aria-label={zoom ? t('viewer.zoomOut') : t('viewer.zoomIn')} title={zoom ? t('viewer.zoomOut') : t('viewer.zoomIn')} onClick={() => setZoom(!zoom)}>{zoom ? <ZoomOut size={18} /> : <ZoomIn size={18} />}</button>}
        <a className="icon-button" href={content(entry.id)} aria-label={t('drive.downloadOriginal')} title={t('drive.downloadOriginal')}><Download size={18} /></a>
      </div>
    </header>
    <div className="lightbox-stage">
      {items.length > 1 && <button type="button" className="lightbox-nav" aria-label={t('viewer.prev')} title={t('viewer.prev')} disabled={index === 0} onClick={() => go(-1)}><ChevronLeft size={28} /></button>}
      <div className={'lightbox-media' + (zoom ? ' zoomed' : '')}>
        {isImage && imageReady && <img src={content(entry.id, 'preview')} alt={entry.name} onClick={() => setZoom(!zoom)} />}
        {isVideo && videoReady && <video key={entry.id} src={content(entry.id, 'preview')} controls autoPlay playsInline preload="metadata" />}
        {isVideo && !videoReady && entry.hasPreview && <img src={content(entry.id, 'thumb')} alt={entry.name} />}
        {(isImage && !imageReady) || (isVideo && !videoReady) ? <p className="lightbox-status" role="status">{entry.mediaStatus === 'failed' ? t('drive.previewFailed') : t('drive.preparing')}</p> : null}
        {needsAction && <button type="button" className="secondary" onClick={() => void retry()}><RotateCcw size={16} /> {entry.mediaStatus === 'failed' ? t('drive.retryPreview') : t('drive.prepareVideo')}</button>}
      </div>
      {items.length > 1 && <button type="button" className="lightbox-nav" aria-label={t('viewer.next')} title={t('viewer.next')} disabled={index === items.length - 1} onClick={() => go(1)}><ChevronRight size={28} /></button>}
    </div>
    {error && <p className="lightbox-error" role="alert">{error}</p>}
  </div>;
}
