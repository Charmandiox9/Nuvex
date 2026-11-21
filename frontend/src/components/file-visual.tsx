import { File, FileAudio, FileImage } from 'lucide-react';
import { content } from '@/lib/api';
import type { Entry } from '@/types/entry';
import { FolderGlyph } from './folder-glyph';

export function FileVisual({ row }: { row: Entry }) {
  if (row.kind === 'folder') {
    return <span className="folder-visual">
      <span className="folder-art">
        <FolderGlyph className="folder-glyph" />
        {row.hasIcon && !row.trashedAt && <img className="folder-badge" src={content(row.id, 'icon')} alt="" loading="lazy" />}
      </span>
    </span>;
  }
  if (row.hasPreview && !row.trashedAt) {
    return <img className="file-thumb" src={content(row.id, 'thumb')} alt="" loading="lazy" />;
  }
  const Icon = row.mime.startsWith('image/') ? FileImage : row.mime.startsWith('audio/') ? FileAudio : File;
  return <span className="file-icon"><Icon size={21} strokeWidth={1.65} /></span>;
}
