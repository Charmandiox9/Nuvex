import { notFound } from 'next/navigation';
import { parseDriveRoute } from '../routes';

export default async function DrivePage({ params }: { params: Promise<{ route?: string[] }> }) {
  if (!parseDriveRoute((await params).route ?? [])) notFound();
  return null;
}
