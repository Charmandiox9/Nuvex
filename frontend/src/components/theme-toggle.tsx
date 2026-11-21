'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from '@/hooks/use-theme';
import { useI18n } from '@/i18n/provider';

export const themeOptions = [
  { id: 'system', key: 'panel.themeSystem', icon: Monitor },
  { id: 'light', key: 'panel.themeLight', icon: Sun },
  { id: 'dark', key: 'panel.themeDark', icon: Moon },
] as const;

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const [theme, setTheme] = useTheme();
  const { t } = useI18n();
  return <div className="theme-toggle" role="group" aria-label={t('panel.themeAria')}>
    {themeOptions.map(({ id, key, icon: Icon }) => (
      <button key={id} type="button" className={'secondary' + (theme === id ? ' theme-active' : '')}
        aria-pressed={theme === id} aria-label={t(key)} title={t(key)} onClick={() => setTheme(id)}>
        <Icon size={16} />{compact ? null : t(key)}
      </button>
    ))}
  </div>;
}
