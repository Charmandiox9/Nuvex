import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Providers } from '@/components/providers';

const fallbackOrigin = 'http://localhost:3000';
const origin = process.env.PUBLIC_ORIGIN ?? fallbackOrigin;
const base = ((): URL => {
  try { return new URL(origin); } catch { return new URL(fallbackOrigin); }
})();

export const metadata: Metadata = {
  metadataBase: base,
  title: { default: 'Nuvex · Drive privado', template: '%s · Nuvex' },
  description: 'Tu espacio privado para archivos, fotos y videos.',
  applicationName: 'Nuvex',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/icon.svg', apple: '/icon.svg' },
  robots: { index: false, follow: false },
  openGraph: {
    type: 'website',
    title: 'Nuvex · Drive privado',
    description: 'Tu espacio privado para archivos, fotos y videos.',
    images: ['/icon-512.png'],
  },
  twitter: {
    card: 'summary',
    title: 'Nuvex · Drive privado',
    description: 'Tu espacio privado para archivos, fotos y videos.',
    images: ['/icon-512.png'],
  },
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#101311' };

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{var t=localStorage.getItem('nuvex-theme');if(t==='light'||t==='dark'){document.documentElement.dataset.theme=t;}document.documentElement.lang=localStorage.getItem('nuvex-locale')==='en'?'en':'es';}catch(e){}})();` }} />
      </head>
      <body><Providers>{children}</Providers></body>
    </html>
  );
}
