import { ArrowUpFromLine, X } from 'lucide-react';
import { formatBytes } from '@/lib/format';
import { useI18n } from '@/i18n/provider';
import type { Transfer } from '@/hooks/use-transfers';

export function Transfers({ transfers, cancel }: { transfers: Transfer[]; cancel: (id: string) => void }) {
  const { t, locale } = useI18n();
  return <section className="panel">
    <h2><ArrowUpFromLine size={20} /> {t('transfers.title')}</h2>
    {transfers.length === 0 && <p>{t('transfers.empty')}</p>}
    {transfers.map((item) => <article className="transfer" key={item.id}>
      <div><strong>{item.name}</strong><small>{t('transfers.progress', { state: item.state, sent: formatBytes(item.sent, locale), total: formatBytes(item.total, locale) })}</small></div>
      <progress aria-label={t('transfers.progressAria', { name: item.name })} value={item.sent} max={item.total || 1} />
      {item.error && <span className="error">{item.error}</span>}
      {item.state.endsWith('…') && <button className="icon-button" aria-label={t('transfers.cancelAria', { name: item.name })} onClick={() => cancel(item.id)}><X size={16} /></button>}
    </article>)}
  </section>;
}
