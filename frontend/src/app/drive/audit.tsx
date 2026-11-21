'use client';

import { useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { History } from 'lucide-react';
import { api } from '@/lib/api';
import { message } from '@/lib/format';
import { useI18n } from '@/i18n/provider';
import { Pagination } from '@/components/pagination';

type AuditItem = { id: string; action: string; target?: string; createdAt: string };
type AuditPage = { items: AuditItem[]; nextCursor?: string };

const PAGE_SIZE = 8;

const actions: Record<string, string> = {
  'auth.verified': 'audit.action.verified',
  'auth.recovery': 'audit.action.recovery',
  'auth.password.changed': 'audit.action.password',
  'auth.recovery.regenerated': 'audit.action.recoveryRegenerated',
  'auth.totp.enrolled': 'audit.action.totpEnrolled',
  'auth.totp.disabled': 'audit.action.totpDisabled',
  'auth.sessions.revoked': 'audit.action.sessionsRevoked',
  'share.redeemed': 'audit.action.redeemed',
};

export function Audit() {
  const { t, locale } = useI18n();
  const [page, setPage] = useState(1);
  const query = useInfiniteQuery({
    queryKey: ['audit'],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => api<AuditPage>('/audit?limit=' + PAGE_SIZE
      + (pageParam ? '&cursor=' + encodeURIComponent(pageParam) : '')),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const loaded = query.data?.pages ?? [];
  const pages = Math.max(loaded.length, 1);
  const current = Math.min(page, pages);
  const rows = loaded[current - 1]?.items ?? [];
  const label = (action: string) => (actions[action] ? t(actions[action]) : action);

  async function goToPage(target: number) {
    if (target < 1 || target === current) return;
    if (target <= pages) { setPage(target); return; }
    if (!query.hasNextPage || query.isFetchingNextPage) return;
    await query.fetchNextPage();
    setPage(target);
  }

  return <section className="panel">
    <h2><History size={20} /> {t('audit.title')}</h2>
    {query.error && <p className="error" role="alert">{message(query.error)}</p>}
    {query.isSuccess && rows.length === 0 && <p>{t('audit.empty')}</p>}
    {rows.map((row) => <article className="transfer" key={row.id}>
      <div>
        <strong>{label(row.action)}</strong>
        <small>{new Date(row.createdAt).toLocaleString(locale)}{row.target ? ' · ' + row.target : ''}</small>
      </div>
    </article>)}
    <Pagination page={current} pages={pages} hasNext={Boolean(query.hasNextPage)}
      busy={query.isFetchingNextPage} onSelect={(target) => void goToPage(target)} />
  </section>;
}
