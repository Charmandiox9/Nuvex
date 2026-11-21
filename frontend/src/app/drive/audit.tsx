'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { History } from 'lucide-react';
import { api } from '@/lib/api';
import { message } from '@/lib/format';
import { useI18n } from '@/i18n/provider';

type AuditItem = { id: string; action: string; target?: string; createdAt: string };
type AuditPage = { items: AuditItem[]; nextCursor?: string };

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
  const page = useInfiniteQuery({
    queryKey: ['audit'],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => api<AuditPage>('/audit' + (pageParam ? '?cursor=' + encodeURIComponent(pageParam) : '')),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const rows = page.data?.pages.flatMap((item) => item.items) ?? [];
  const label = (action: string) => (actions[action] ? t(actions[action]) : action);

  return <section className="panel">
    <h2><History size={20} /> {t('audit.title')}</h2>
    {page.error && <p className="error" role="alert">{message(page.error)}</p>}
    {page.isSuccess && rows.length === 0 && <p>{t('audit.empty')}</p>}
    {rows.map((row) => <article className="transfer" key={row.id}>
      <div>
        <strong>{label(row.action)}</strong>
        <small>{new Date(row.createdAt).toLocaleString(locale)}{row.target ? ' · ' + row.target : ''}</small>
      </div>
    </article>)}
    {page.hasNextPage && <button className="secondary" disabled={page.isFetchingNextPage} onClick={() => void page.fetchNextPage()}>{t('audit.loadMore')}</button>}
  </section>;
}
