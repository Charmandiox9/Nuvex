import { BadRequestException } from '@nestjs/common';
import type { Entry } from '../../prisma/generated/client';

export const mediaKind = (mime: string) => /^(image\/(jpeg|png|webp|gif|avif)|video\/[a-z0-9.+-]+)$/i.test(mime);
export function cleanName(value: string) {
  const name = value.normalize('NFC').trim();
  // Control characters must not cross into headers, displayed names or file operations.
  // eslint-disable-next-line no-control-regex
  if (!name || name.length > 200 || /[\x00-\x1F\x7F/\\]/.test(name) || name === '.' || name === '..') {
    throw new BadRequestException('Nombre de archivo o carpeta inválido.');
  }
  return name;
}

export function serializeEntry(row: Entry) {
  return {
    id: row.id, parentId: row.parentId, name: row.name, kind: row.kind, mime: row.mime,
    size: row.size.toString(), mediaStatus: row.mediaStatus, updatedAt: row.updatedAt.toISOString(),
    trashedAt: row.trashedAt?.toISOString(), hasPreview: Boolean(row.previewKey || row.videoKey || row.posterKey),
    hasIcon: Boolean(row.iconKey),
  };
}
