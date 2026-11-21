'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Eye, EyeOff, LockKeyhole, ShieldCheck } from 'lucide-react';
import { api } from '@/lib/api';
import { message } from '@/lib/format';
import { Brand } from '@/components/brand';
import { useI18n } from '@/i18n/provider';
import { PreferencesMenu } from '@/components/preferences-menu';
import { drivePath, driveRouteFromPathname } from './drive/routes';

type LoginResult = { stage: 'verify' | 'enroll'; qr?: string; setupKey?: string };

function loginDestination() {
  const next = new URLSearchParams(window.location.search).get('next');
  const target = next ? driveRouteFromPathname(next) : null;
  return target ? drivePath(target.view, target.folderId) : drivePath('files');
}

export default function Login() {
  const router = useRouter();
  const { t } = useI18n();
  const [login, setLogin] = useState<LoginResult>();
  const [recovery, setRecovery] = useState(false);
  const [codes, setCodes] = useState<string[]>([]);
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [Scene, setScene] = useState<React.ComponentType>();

  useEffect(() => {
    let active = true;
    const preference = window.matchMedia('(prefers-reduced-motion: reduce), (max-width: 850px)');
    function sync() {
      if (preference.matches) setScene(undefined);
      else void import('@/components/login-scene').then((module) => {
        if (active && !preference.matches) setScene(() => module.LoginScene);
      }).catch(() => undefined);
    }
    const idle = window.setTimeout(sync, 300);
    preference.addEventListener('change', sync);
    void api('/auth/me').then(() => { if (active) router.replace(loginDestination()); }).catch(() => undefined);
    return () => {
      active = false;
      window.clearTimeout(idle);
      preference.removeEventListener('change', sync);
    };
  }, [router]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    try {
      if (!login) setLogin(await api<LoginResult>('/auth/login', 'POST', {
        username: form.get('username'), password: form.get('password'),
      }));
      else {
        const result = await api<{ recoveryCodes: string[] }>(recovery ? '/auth/recovery' : '/auth/totp', 'POST', { code: form.get('code') });
        if (result.recoveryCodes.length) setCodes(result.recoveryCodes);
        else router.replace(loginDestination());
      }
    } catch (error) { setError(message(error)); }
    finally { setBusy(false); }
  }

  return <main className="login">
    <section className="login-side">
      <header className="login-header">
        <Brand />
        <div className="login-preferences">
          <PreferencesMenu />
        </div>
      </header>
      <div className="login-form">
        <div className="login-icon">{login ? <ShieldCheck size={21} /> : <LockKeyhole size={21} />}</div>
        <h1>{codes.length ? t('login.title.codes') : login?.stage === 'enroll' ? t('login.title.enroll') : login ? t('login.title.verify') : t('login.title.signin')}</h1>
        {codes.length ? <>
          <p>{t('login.codes.hint')}</p>
          <ul className="recovery-codes">{codes.map((code) => <li key={code}>{code}</li>)}</ul>
          <button className="primary login-submit" onClick={() => router.replace(loginDestination())}>{t('login.codes.open')} <ArrowRight size={17} /></button>
        </> : <>
          <p>{login?.stage === 'enroll' ? t('login.enroll.hint') : login ? t('login.verify.hint') : t('login.signin.hint')}</p>
          {login?.qr && <div className="setup">
            {/* The QR code is generated for this session and returned as a data URL. */}
            <img src={login.qr} width={128} height={128} alt={t('login.title.enroll')} />
            <span>{t('login.manualKey')} <code>{login.setupKey}</code></span>
          </div>}
          <form key={login ? 'factor' : 'login'} onSubmit={submit}>
            {login ? <>
              <label htmlFor="code">{recovery ? t('login.recoveryCode') : t('login.verificationCode')}</label>
              <input id="code" name="code" required autoComplete="one-time-code" autoCapitalize="off"
                spellCheck={false} inputMode={recovery ? 'text' : 'numeric'} enterKeyHint="done"
                minLength={6} maxLength={recovery ? 32 : 6} pattern={recovery ? undefined : '[0-9]{6}'} />
              {login.stage === 'verify' && <button type="button" className="text-button" onClick={() => { setRecovery(!recovery); setError(''); }}>
                {recovery ? t('login.useAuthenticator') : t('login.useRecovery')}
              </button>}
            </> : <>
              <label htmlFor="username">{t('login.username')}</label>
              <input id="username" name="username" autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} required maxLength={80} />
              <label htmlFor="password">{t('login.password')}</label>
              <div className="password-field">
                <input id="password" name="password" type={visible ? 'text' : 'password'} autoComplete="current-password" enterKeyHint="done" required maxLength={256} />
                <button type="button" aria-label={visible ? t('login.hidePassword') : t('login.showPassword')} onClick={() => setVisible(!visible)}>{visible ? <EyeOff size={17} /> : <Eye size={17} />}</button>
              </div>
            </>}
            {error && <p className="error" role="alert">{error}</p>}
            <button className="primary login-submit" disabled={busy}>{busy ? t('login.verifying') : login ? t('login.verifyEnter') : t('login.signinBtn')}<ArrowRight size={17} /></button>
          </form>
          {login && <button className="text-button" onClick={() => { setLogin(undefined); setError(''); setRecovery(false); }}>{t('login.back')}</button>}
        </>}
      </div>
      <div className="login-foot"><ShieldCheck size={15} /> {t('login.foot')}</div>
    </section>
    <aside className="login-art" aria-hidden="true">
      <div className="art-grid" />
      <div className="art-orbit" />
      <div className="art-sweep" />
      {Scene && <Scene />}
      <div className="art-meta"><span>NUVEX / DRIVE PRIVADO</span><span>◆</span></div>
      <div className="art-title">{t('login.artTitle1')}<br /><span>{t('login.artTitle2')}</span></div>
    </aside>
  </main>;
}
