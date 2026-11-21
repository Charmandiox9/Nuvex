'use client';

import { useQuery } from '@tanstack/react-query';
import { Files, HardDrive, PieChart, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { formatBytes, message } from '@/lib/format';
import { useI18n } from '@/i18n/provider';

type StorageOverview = {
  used: string;
  quota: string;
  trashBytes: string;
  volume: { availableBytes: string; totalBytes: string; measuredAt: string } | null;
  largestFiles: { id: string; name: string; size: string }[];
};

export function StoragePanel({ openTrash }: { openTrash: () => void }) {
  const { t, locale } = useI18n();
  const overview = useQuery({
    queryKey: ['storage-overview'], queryFn: () => api<StorageOverview>('/storage/overview'), refetchInterval: 60_000,
  });
  if (overview.isPending) return <p role="status">{t('storage.loading')}</p>;
  if (!overview.data) return <section className="panel stack">
    <p className="error" role="alert">{message(overview.error)}</p>
    <div><button type="button" className="secondary" onClick={() => void overview.refetch()}>{t('storage.retry')}</button></div>
  </section>;

  const { used, quota, trashBytes, volume, largestFiles } = overview.data;
  const quotaText = t('drive.quotaUsed', { used: formatBytes(used, locale), quota: formatBytes(quota, locale) });
  return <div className="settings-grid storage-overview">
    {overview.isError && <p className="error settings-wide" role="alert">{t('storage.refreshFailed')}</p>}
    <section className="panel" aria-labelledby="storage-quota">
      <h2 id="storage-quota"><PieChart size={20} aria-hidden="true" /> {t('storage.quota')}</h2>
      <p className="storage-value">{quotaText}</p>
      {Number(quota) > 0 && <meter min={0} max={Number(quota)} value={Number(used)} aria-label={t('storage.quota')} aria-valuetext={quotaText} />}
      <p>{t('storage.quotaDetails')}</p>
    </section>
    <section className="panel" aria-labelledby="storage-volume">
      <h2 id="storage-volume"><HardDrive size={20} aria-hidden="true" /> {t('storage.volume')}</h2>
      {volume ? <>
        <p className="storage-value">{t('storage.available', { size: formatBytes(volume.availableBytes, locale) })}</p>
        <p>{t('storage.total', { size: formatBytes(volume.totalBytes, locale) })}</p>
        <p>{t('storage.measuredAt', { date: new Date(volume.measuredAt).toLocaleString(locale, { dateStyle: 'short', timeStyle: 'short' }) })}</p>
      </> : <p>{t('storage.volumeUnavailable')}</p>}
    </section>
    <section className="panel" aria-labelledby="storage-trash">
      <h2 id="storage-trash"><Trash2 size={20} aria-hidden="true" /> {t('storage.trash')}</h2>
      <p className="storage-value">{formatBytes(trashBytes, locale)}</p>
      <p>{t('storage.trashDetails')}</p>
      <button type="button" className="secondary" onClick={openTrash}>{t('storage.openTrash')}</button>
    </section>
    <section className="panel" aria-labelledby="storage-largest">
      <h2 id="storage-largest"><Files size={20} aria-hidden="true" /> {t('storage.largest')}</h2>
      {largestFiles.length > 0 ? <ol className="storage-files" role="list">
        {largestFiles.map((file) => <li className="transfer" key={file.id}>
          <strong>{file.name}</strong><span>{formatBytes(file.size, locale)}</span>
        </li>)}
      </ol> : <p>{t('storage.empty')}</p>}
    </section>
  </div>;
}
