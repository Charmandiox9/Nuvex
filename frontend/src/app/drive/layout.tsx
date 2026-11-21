import type { Metadata } from 'next';
import { DriveWorkspace } from './workspace';

export const metadata: Metadata = {
  title: 'Drive',
  robots: { index: false, follow: false },
};

export default function DriveLayout({ children }: { children: React.ReactNode }) {
  return <DriveWorkspace>{children}</DriveWorkspace>;
}
