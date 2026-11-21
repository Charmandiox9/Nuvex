import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Drive',
  robots: { index: false, follow: false },
};

export default function DriveLayout({ children }: { children: React.ReactNode }) {
  return children;
}
