'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sileo';
import { useEffect, useState } from 'react';
import { I18nProvider } from '@/i18n/provider';
import { ServiceWorker } from '@/components/service-worker';

function useResolvedTheme(): 'light' | 'dark' {
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const root = document.documentElement;
    const resolve = () => {
      const forced = root.dataset.theme;
      setTheme(forced === 'light' || forced === 'dark' ? forced : media.matches ? 'dark' : 'light');
    };
    resolve();
    const observer = new MutationObserver(resolve);
    observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] });
    media.addEventListener('change', resolve);
    return () => { observer.disconnect(); media.removeEventListener('change', resolve); };
  }, []);
  return theme;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 10_000 } },
  }));
  const theme = useResolvedTheme();
  return <I18nProvider>
    <QueryClientProvider client={client}>
      {children}
      <Toaster position="bottom-right" theme={theme} />
      <ServiceWorker />
    </QueryClientProvider>
  </I18nProvider>;
}
