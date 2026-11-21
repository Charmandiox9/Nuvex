'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Languages, Palette } from 'lucide-react';
import { useTheme } from '@/hooks/use-theme';
import { useI18n } from '@/i18n/provider';
import { themeOptions } from '@/components/theme-toggle';
import { languageOptions } from '@/components/language-toggle';

export function PreferencesMenu() {
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useTheme();
  const { locale, setLocale, t } = useI18n();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return <div className="prefs" ref={ref}>
    <button type="button" className="icon-button" aria-haspopup="menu" aria-expanded={open}
      aria-label={t('panel.appearance')} title={t('panel.appearance')} onClick={() => setOpen(!open)}>
      <Palette size={18} />
    </button>
    {open && <div className="prefs-menu" role="menu">
      <p className="prefs-label"><Palette size={13} /> {t('panel.appearance')}</p>
      {themeOptions.map(({ id, key, icon: Icon }) => (
        <button key={id} type="button" role="menuitemradio" aria-checked={theme === id} className="prefs-item" onClick={() => setTheme(id)}>
          <Icon size={16} /><span>{t(key)}</span>{theme === id && <Check size={15} className="prefs-check" />}
        </button>
      ))}
      <p className="prefs-label"><Languages size={13} /> {t('panel.language')}</p>
      {languageOptions.map(({ id, label }) => (
        <button key={id} type="button" role="menuitemradio" aria-checked={locale === id} className="prefs-item" onClick={() => setLocale(id)}>
          <span>{label}</span>{locale === id && <Check size={15} className="prefs-check" />}
        </button>
      ))}
    </div>}
  </div>;
}
