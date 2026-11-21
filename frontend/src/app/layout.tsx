import type { Metadata } from 'next';
import './globals.css';
import { Providers } from '@/components/providers';

export const metadata: Metadata = {
  title: 'Nuvex · Drive privado',
  description: 'Tu espacio privado para archivos, fotos y videos.',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{var t=localStorage.getItem('nuvex-theme');if(t==='light'||t==='dark'){document.documentElement.dataset.theme=t;}document.documentElement.lang=localStorage.getItem('nuvex-locale')==='en'?'en':'es';}catch(e){}})();` }} />
        <link rel="manifest" href="/manifest.webmanifest" />
        <meta name="theme-color" content="#101311" />
        <link rel="icon" href="/icon.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/icon.svg" />
      </head>
      <body><Providers>{children}</Providers></body>
    </html>
  );
}
