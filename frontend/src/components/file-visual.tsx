import { File, FileImage, Folder } from 'lucide-react';
import { content } from '@/lib/api';
import type { Entry } from '@/types/entry';

export function FileVisual({ row }: { row: Entry }) {
  if (row.kind !== 'folder' && row.hasPreview && !row.trashedAt) {
    return <img className="file-thumb" src={content(row.id, 'thumb')} alt="" loading="lazy" />;
  }
  const Icon = row.kind === 'folder' ? Folder : row.mime.startsWith('image/') ? FileImage : File;
  return <span className={'file-icon ' + (row.kind === 'folder' ? 'is-folder' : '')}><Icon size={21} strokeWidth={1.65} /></span>;
}
