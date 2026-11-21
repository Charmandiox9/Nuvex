const views = ['files', 'gallery', 'trash', 'links', 'transfers', 'imports', 'storage', 'settings'] as const;
export type DriveView = typeof views[number];
export type DriveRoute = { view: DriveView; folderId?: string };

const folderIdPattern = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/;

export function parseDriveRoute(segments: string[]): DriveRoute | null {
  if (!segments.length) return { view: 'files' };
  if (segments.length === 2 && segments[0] === 'folders' && folderIdPattern.test(segments[1])) {
    return { view: 'files', folderId: segments[1] };
  }
  const view = views.find((candidate) => candidate !== 'files' && candidate === segments[0]);
  return segments.length === 1 && view ? { view } : null;
}

export function driveRouteFromPathname(pathname: string) {
  const [root, ...segments] = pathname.replace(/\/$/, '').slice(1).split('/');
  if (!pathname.startsWith('/') || root !== 'drive') return null;
  try { return parseDriveRoute(segments.map(decodeURIComponent)); }
  catch { return null; }
}

export function drivePath(view: DriveView, folderId?: string) {
  if (view !== 'files') return `/drive/${view}`;
  return folderId ? `/drive/folders/${encodeURIComponent(folderId)}` : '/drive';
}
