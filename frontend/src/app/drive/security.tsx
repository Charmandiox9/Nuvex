'use client';

import { useState, type FormEvent } from 'react';
import { KeyRound, RefreshCw, ShieldCheck, ShieldOff } from 'lucide-react';
import { sileo } from 'sileo';
import { api } from '@/lib/api';
import { message } from '@/lib/format';
import { useI18n } from '@/i18n/provider';

type EnrollResult = { qr: string; setupKey: string };

export function PasswordPanel() {
  const { t } = useI18n();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');

  async function changePassword(event: FormEvent) {
    event.preventDefault();
    if (next !== repeat) { setError(t('security.passwordMismatch')); return; }
    setError('');
    setBusy(true);
    try {
      await api('/auth/password', 'POST', { currentPassword: current, newPassword: next });
      setCurrent(''); setNext(''); setRepeat('');
      sileo.success({ title: t('security.passwordUpdated') });
    } catch (error) { setError(message(error)); }
    finally { setBusy(false); }
  }

  return <section className="panel">
    <h2><KeyRound size={20} /> {t('security.changePassword')}</h2>
    <form className="stack security-form" onSubmit={changePassword}>
      <label htmlFor="pw-current">{t('security.currentPassword')}</label>
      <input id="pw-current" type="password" value={current} onChange={(event) => setCurrent(event.target.value)} autoComplete="current-password" minLength={1} maxLength={256} required />
      <label htmlFor="pw-next">{t('security.newPassword')}</label>
      <input id="pw-next" type="password" value={next} onChange={(event) => setNext(event.target.value)} autoComplete="new-password" minLength={8} maxLength={256} required />
      <label htmlFor="pw-repeat">{t('security.repeatPassword')}</label>
      <input id="pw-repeat" type="password" value={repeat} onChange={(event) => setRepeat(event.target.value)} autoComplete="new-password" minLength={8} maxLength={256} required />
      {error && <p className="error" role="alert">{error}</p>}
      <button className="primary" disabled={busy}>{t('security.savePassword')}</button>
    </form>
  </section>;
}

export function TwoFactorPanel() {
  const { t } = useI18n();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [codes, setCodes] = useState<string[]>([]);
  const [enroll, setEnroll] = useState<EnrollResult>();
  const [secret, setSecret] = useState('');
  const [enrollCode, setEnrollCode] = useState('');
  const [disableCode, setDisableCode] = useState('');

  async function run(task: () => Promise<void>) {
    setError('');
    setBusy(true);
    try { await task(); }
    catch (error) { setError(message(error)); }
    finally { setBusy(false); }
  }

  async function regenerate() {
    await run(async () => {
      const result = await api<{ recoveryCodes: string[] }>('/auth/recovery/regenerate', 'POST', { currentPassword: secret });
      setCodes(result.recoveryCodes);
      sileo.success({ title: t('security.codesRegenerated') });
    });
  }

  async function startEnroll() {
    await run(async () => {
      const result = await api<EnrollResult>('/auth/totp/enroll', 'POST', { currentPassword: secret });
      setEnroll(result);
      setEnrollCode('');
    });
  }

  async function confirmEnroll(event: FormEvent) {
    event.preventDefault();
    await run(async () => {
      const result = await api<{ recoveryCodes: string[] }>('/auth/totp/confirm', 'POST', { code: enrollCode });
      setCodes(result.recoveryCodes);
      setEnroll(undefined);
      setEnrollCode('');
      sileo.success({ title: t('security.enrolled') });
    });
  }

  async function disable(event: FormEvent) {
    event.preventDefault();
    await run(async () => {
      await api('/auth/2fa/disable', 'POST', { currentPassword: secret, code: disableCode });
      setDisableCode('');
      sileo.success({ title: t('security.disabled') });
    });
  }

  return <section className="panel">
    <h2><ShieldCheck size={20} /> {t('security.twoFactor')}</h2>
    <p>{t('security.twoFactorHint')}</p>
    <label htmlFor="sec-secret">{t('security.currentPassword')}</label>
    <input id="sec-secret" type="password" value={secret} onChange={(event) => setSecret(event.target.value)} autoComplete="current-password" minLength={1} maxLength={256} />
    <div className="actions">
      <button type="button" className="secondary" disabled={busy || !secret} onClick={regenerate}><RefreshCw size={16} /> {t('security.regenerateCodes')}</button>
      <button type="button" className="secondary" disabled={busy || !secret} onClick={startEnroll}>{t('security.reconfigure')}</button>
    </div>
    {enroll && <div className="stack">
      <p>{t('security.scanQr')}</p>
      <div className="setup"><img src={enroll.qr} width={128} height={128} alt={t('security.qrAlt')} /><span>{t('security.manualKey')} <code>{enroll.setupKey}</code></span></div>
      <form className="stack security-form" onSubmit={confirmEnroll}>
        <label htmlFor="enroll-code">{t('security.code')}</label>
        <input id="enroll-code" inputMode="numeric" autoComplete="one-time-code" minLength={6} maxLength={6} value={enrollCode} onChange={(event) => setEnrollCode(event.target.value)} required />
        <button className="primary" disabled={busy}>{t('security.confirmCode')}</button>
      </form>
    </div>}
    <form className="stack security-form" onSubmit={disable}>
      <p>{t('security.disableHint')}</p>
      <label htmlFor="disable-code">{t('security.code')}</label>
      <input id="disable-code" inputMode="numeric" autoComplete="one-time-code" minLength={6} maxLength={6} value={disableCode} onChange={(event) => setDisableCode(event.target.value)} />
      <button className="danger" disabled={busy || !secret || disableCode.length < 6}><ShieldOff size={16} /> {t('security.disableTwoFactor')}</button>
    </form>
    {error && <p className="error" role="alert">{error}</p>}
    {codes.length > 0 && <div className="stack">
      <p>{t('security.newCodes')}</p>
      <ul className="recovery-codes">{codes.map((code) => <li key={code}>{code}</li>)}</ul>
    </div>}
  </section>;
}
