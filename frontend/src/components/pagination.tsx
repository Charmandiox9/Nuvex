'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useI18n } from '@/i18n/provider';

export const pageCount = (total: number, size: number) => Math.max(1, Math.ceil(total / size));

export function pageSlice<T>(items: T[], page: number, size: number) {
  const start = (page - 1) * size;
  return items.slice(start, start + size);
}

function pageWindow(page: number, pages: number): (number | 'gap')[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, index) => index + 1);
  if (page <= 4) return [1, 2, 3, 4, 5, 'gap', pages];
  if (page >= pages - 3) return [1, 'gap', pages - 4, pages - 3, pages - 2, pages - 1, pages];
  return [1, 'gap', page - 1, page, page + 1, 'gap', pages];
}

type PaginationProps = {
  page: number;
  pages: number;
  hasNext?: boolean;
  busy?: boolean;
  onSelect: (page: number) => void;
};

export function Pagination({ page, pages, hasNext = false, busy = false, onSelect }: PaginationProps) {
  const { t } = useI18n();
  const last = Math.max(1, pages);
  const current = Math.min(Math.max(1, page), last);
  if (last <= 1 && !hasNext) return null;
  const canNext = current < last || hasNext;
  return <nav className="pagination" aria-label={t('pagination.aria')}>
    <button type="button" className="icon-button" aria-label={t('pagination.prev')} disabled={current <= 1}
      onClick={() => onSelect(current - 1)}><ChevronLeft size={17} /></button>
    {pageWindow(current, last).map((item, index) => item === 'gap'
      ? <span key={'gap-' + index} className="pagination-gap" aria-hidden="true">…</span>
      : <button type="button" key={item} className={'pagination-page' + (item === current ? ' is-current' : '')}
        aria-label={t('pagination.page', { page: item })} aria-current={item === current ? 'page' : undefined}
        onClick={() => onSelect(item)}>{item}</button>)}
    <button type="button" className="icon-button" aria-label={t('pagination.next')} disabled={!canNext || busy}
      onClick={() => onSelect(current + 1)}><ChevronRight size={17} /></button>
  </nav>;
}
