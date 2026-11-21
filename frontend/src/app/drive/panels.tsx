'use client';

import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileJson, KeyRound, Languages, Link2, Monitor, Palette, RefreshCw, Trash2 } from 'lucide-react';
import { sileo } from 'sileo';
import { api } from '@/lib/api';
import { message } from '@/lib/format';
import { useI18n } from '@/i18n/provider';
import { ThemeToggle } from '@/components/theme-toggle';
import { LanguageToggle } from '@/components/language-toggle';
import type { Locale } from '@/i18n/catalogs';
import { Security } from './security';
import { Audit } from './audit';

type Link = { id: string; entryId: string; expiresAt: string; revokedAt?: string; remaining: number; maxUses: number; entryName?: string; lastRedeemedAt?: string };
type Session = { id: string; current: boolean; createdAt: string; expiresAt: string };
type ImportItem = { id: string; name?: string; url: string; state: string; error?: string };
const date = (iso: string, locale: Locale) => new Date(iso).toLocaleString(locale);

export function LinkPanel() {
  const { t, locale } = useI18n();
  const links = useQuery({ queryKey: ['links'], queryFn: () => api<Link[]>('/shares') });
  return <section className="panel">
    <h2><Link2 size={20} /> {t('panel.linksTitle')}</h2>
    {links.error && <p className="error">{message(links.error)}</p>}
    {links.data?.length === 0 && <p>{t('panel.linksEmpty')}</p>}
    {links.data?.map((link) => <article className="transfer" key={link.id}>
      <div><strong>{link.entryName ?? t('panel.sharedLink')}</strong><small>{link.revokedAt ? t('panel.revoked') : t('panel.expires', { date: date(link.expiresAt, locale) })} · {t('panel.usesLeft', { remaining: link.remaining, max: link.maxUses })}</small>
        {link.lastRedeemedAt && <small>{t('panel.lastRedeem', { date: date(link.lastRedeemedAt, locale) })}</small>}
      </div>
      {!link.revokedAt && <button className="secondary" onClick={async () => {
        try { await api('/shares/' + link.id, 'DELETE'); await links.refetch(); sileo.success({ title: t('panel.linkRevoked') }); }
        catch (error) { sileo.error({ title: message(error) }); }
      }}>{t('panel.revoke')}</button>}
    </article>)}
  </section>;
}

export function Settings() {
  const { t, locale } = useI18n();
  const sessions = useQuery({ queryKey: ['sessions'], queryFn: () => api<Session[]>('/auth/sessions') });
  const deepseek = useQuery({ queryKey: ['deepseek'], queryFn: () => api<{ configured: boolean }>('/imports/deepseek') });
  const [key, setKey] = useState('');
  const [error, setError] = useState('');
  async function action(path: string, method: string, payload?: unknown) {
    setError('');
    try {
      await api(path, method, payload);
      setKey('');
      sileo.success({ title: t('panel.done') });
      await Promise.all([sessions.refetch(), deepseek.refetch()]);
    } catch (error) { setError(message(error)); }
  }
  return <>
    {error && <p className="error" role="alert">{error}</p>}
    <section className="panel">
      <h2><Palette size={20} /> {t('panel.appearance')}</h2>
      <ThemeToggle />
    </section>
    <section className="panel">
      <h2><Languages size={20} /> {t('panel.language')}</h2>
      <LanguageToggle />
    </section>
    <section className="panel">
      <h2><Monitor size={20} /> {t('panel.sessions')}</h2>
      {sessions.error && <p className="error">{message(sessions.error)}</p>}
      {sessions.data?.map((session) => <article className="transfer" key={session.id}>
        <div><strong>{session.current ? t('panel.thisSession') : t('panel.otherSession')}</strong><small>{date(session.createdAt, locale)} · {t('panel.expiresAt', { date: date(session.expiresAt, locale) })}</small></div>
        {!session.current && <button className="secondary" onClick={() => action('/auth/sessions/' + session.id, 'DELETE')}>{t('panel.closeSession')}</button>}
      </article>)}
    </section>
    <Security />
    <Audit />
    <section className="panel">
      <h2><KeyRound size={20} /> {t('panel.deepseek')}</h2>
      <p>{deepseek.data?.configured ? t('panel.deepseekOn') : t('panel.deepseekOff')}</p>
      <form className="settings-form" onSubmit={(event) => { event.preventDefault(); void action('/imports/deepseek', 'PUT', { key }); }}>
        <label htmlFor="deepseek-key">{t('panel.apiKey')}</label>
        <input id="deepseek-key" type="password" value={key} onChange={(event) => setKey(event.target.value)} minLength={10} maxLength={250} required autoComplete="off" />
        <button className="primary">{deepseek.data?.configured ? t('panel.replaceKey') : t('panel.saveKey')}</button>
        {deepseek.data?.configured && <>
          <button type="button" className="secondary" onClick={() => action('/imports/deepseek/test', 'POST')}>{t('panel.test')}</button>
          <button type="button" className="icon-button" aria-label={t('panel.deleteKey')} onClick={() => action('/imports/deepseek', 'DELETE')}><Trash2 size={17} /></button>
        </>}
      </form>
    </section>
  </>;
}

type Candidate = { url: string; name: string; checked: boolean; kind?: string };
export function Imports({ parentId, folderName }: { parentId: string; folderName: string }) {
  const { t } = useI18n();
  const [json, setJson] = useState('');
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const jobs = useQuery({ queryKey: ['imports'], queryFn: () => api<ImportItem[]>('/imports'), refetchInterval: 4000 });
  const deepseek = useQuery({ queryKey: ['deepseek'], queryFn: () => api<{ configured: boolean }>('/imports/deepseek') });
  const [showConsent, setShowConsent] = useState(false);
  const selected = candidates.filter((item) => item.checked);
  const suggestionUrls = selected.slice(0, 30).map((item) => item.url);
  const stateKey: Record<string, string> = { queued: 'panel.state.queued', processing: 'panel.state.processing', completed: 'panel.state.completed', failed: 'panel.state.failed' };

  async function run(action: () => Promise<void>) {
    setError('');
    setBusy(true);
    try { await action(); }
    catch (error) { setError(message(error)); }
    finally { setBusy(false); }
  }
  async function inspect(event: FormEvent) {
    event.preventDefault();
    await run(async () => {
      let parsed;
      try { parsed = JSON.parse(json); } catch { throw new Error(t('panel.invalidJson')); }
      const result = await api<{ urls: string[] }>('/imports/inspect', 'POST', { json: parsed });
      setCandidates(result.urls.map((url) => ({ url, name: '', checked: true })));
      if (!result.urls.length) setError(t('panel.noValidLinks'));
    });
  }
  return <>
    <section className="panel">
      <h2><FileJson size={20} /> {t('panel.importTitle')}</h2>
      <p>{t('panel.importDest')} <strong>{folderName}</strong></p>
      <form onSubmit={inspect} className="stack">
        <label htmlFor="import-json">{t('panel.jsonContent')}</label>
        <textarea id="import-json" rows={5} required value={json} onChange={(event) => { setJson(event.target.value); setShowConsent(false); setCandidates([]); }} placeholder={'{ "foto": "https://ejemplo.com/foto.jpg" }'} />
        <input type="file" accept=".json,application/json" aria-label={t('panel.openJson')} onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (file) void run(async () => {
            if (file.size > 512_000) throw new Error(t('panel.jsonTooBig'));
            setJson(await file.text()); setCandidates([]); setShowConsent(false);
          });
        }} />
        <button className="secondary" disabled={busy}>{t('panel.findLinks')}</button>
      </form>
      {error && <p className="error" role="alert">{error}</p>}
      {candidates.length > 0 && <div className="candidate-list">
        {candidates.map((item, index) => <article className="candidate" key={item.url}>
          <label><input type="checkbox" checked={item.checked} onChange={(event) => {
            setShowConsent(false);
            setCandidates((rows) => rows.map((row, key) => key === index ? { ...row, checked: event.target.checked } : row));
          }} /> <span>{item.url}{item.kind && <small>{item.kind}</small>}</span></label>
          <input aria-label={t('panel.fileName', { index: index + 1 })} placeholder={t('panel.optionalName')} maxLength={200} value={item.name} onChange={(event) => {
            setCandidates((rows) => rows.map((row, key) => key === index ? { ...row, name: event.target.value } : row));
          }} />
        </article>)}
        <div className="actions">
          <button className="primary" disabled={!selected.length || busy} onClick={() => run(async () => {
            await api('/imports', 'POST', { parentId, items: selected.map(({ url, name }) => ({ url, ...(name.trim() ? { name } : {}) })) });
            setCandidates([]); setShowConsent(false); await jobs.refetch(); sileo.success({ title: t('panel.importQueued') });
          })}>{t(selected.length === 1 ? 'panel.saveFilesOne' : 'panel.saveFilesOther', { count: selected.length })}</button>
          {deepseek.data?.configured && <button className="secondary" disabled={!selected.length || busy} onClick={() => setShowConsent(!showConsent)}>{t('panel.suggestDeepseek')}</button>}
        </div>
        {showConsent && <div className="consent">
          <p>{t('panel.consentText')}</p>
          <ul>{suggestionUrls.map((url) => <li key={url}>{url}</li>)}</ul>
          <button className="secondary" disabled={busy} onClick={() => run(async () => {
            const suggestions = await api<{ items: { url: string; name: string; kind: string }[] }>('/imports/deepseek/suggest', 'POST', { urls: suggestionUrls });
            setCandidates((rows) => rows.map((row) => ({ ...row, ...suggestions.items.find((item) => item.url === row.url) })));
            setShowConsent(false);
          })}>{t('panel.confirmSend')}</button>
        </div>}
      </div>}
    </section>
    <section className="panel">
      <h2><RefreshCw size={19} /> {t('panel.recentImports')}</h2>
      {jobs.error && <p className="error">{message(jobs.error)}</p>}
      {jobs.data?.length === 0 && <p>{t('panel.noImports')}</p>}
      {jobs.data?.map((item) => <article className="transfer" key={item.id}>
        <div><strong>{item.name || item.url}</strong><small>{t(stateKey[item.state] ?? item.state)}{item.error && ' · ' + item.error}</small></div>
        {item.state === 'failed' && <button className="secondary" onClick={() => run(async () => {
          await api('/imports/' + item.id + '/retry', 'POST'); await jobs.refetch();
        })}>{t('panel.retry')}</button>}
      </article>)}
    </section>
  </>;
}
