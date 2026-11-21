import { ArrowUpFromLine, X } from 'lucide-react';
import { formatBytes } from '@/lib/format';
import { useI18n } from '@/i18n/provider';
import type { Transfer } from '@/hooks/use-transfers';

export function Transfers({ transfers, cancel, retry }: {
  transfers: Transfer[]; cancel: (id: string) => void; retry: (id: string) => void;
}) {
  const { t, locale } = useI18n();
  return <section className="panel">
    <h2><ArrowUpFromLine size={20} /> {t('transfers.title')}</h2>
    {transfers.length === 0 && <p>{t('transfers.empty')}</p>}
    {transfers.map((item) => <article className="transfer" key={item.id}>
      <div><strong>{item.name}</strong><small>{t('transfers.progress', { state: t(`transfers.${item.state}`), sent: formatBytes(item.sent, locale), total: formatBytes(item.total, locale) })}</small></div>
      <progress aria-label={t('transfers.progressAria', { name: item.name })} value={item.total === 0 && item.state === 'completed' ? 1 : item.sent} max={item.total || 1} />
      {item.error && <span className="error">{item.error}</span>}
      {item.state === 'interrupted' && <button type="button" className="secondary" aria-label={t('transfers.retryAria', { name: item.name })} onClick={() => retry(item.id)}>{t('transfers.retry')}</button>}
      {['queued', 'verifying', 'uploading'].includes(item.state) && <button type="button" className="icon-button" aria-label={t('transfers.cancelAria', { name: item.name })} onClick={() => cancel(item.id)}><X size={16} /></button>}
    </article>)}
  </section>;
}

export function TransferSummary({ transfers, open }: { transfers: Transfer[]; open: () => void }) {
  const { t } = useI18n();
  const queued = transfers.filter(({ state }) => state === 'queued').length;
  const active = transfers.filter(({ state }) => ['verifying', 'uploading', 'finishing'].includes(state)).length;
  const interrupted = transfers.filter(({ state }) => state === 'interrupted').length;
  const summary = active || queued || interrupted ? t('transfers.summary', { active, queued, interrupted }) : '';
  const label = summary || t('drive.section.transfers');
  return <>
    <span className="sr-only" role="status">{transfers.length > 0 && (summary || t('transfers.idle'))}</span>
    {transfers.length > 0 && <button type="button" className="secondary transfer-summary" aria-label={`${t('transfers.open')}. ${label}`} onClick={open}>
      <ArrowUpFromLine size={16} aria-hidden="true" /> {label}
    </button>}
  </>;
}
