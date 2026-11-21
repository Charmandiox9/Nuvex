import ipaddr from 'ipaddr.js';

export function importUrl(value: string): URL | null {
  if (value.length > 2048) return null;
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port) return null;
    if (!url.hostname.includes('.') && !url.hostname.startsWith('[')) return null;
    const name = url.hostname.replace(/^\[|\]$/g, '');
    if (ipaddr.isValid(name) && !publicIp(name)) return null;
    url.hash = '';
    return url;
  } catch { return null; }
}

export function publicIp(value: string) {
  return ipaddr.isValid(value) && ipaddr.process(value).range() === 'unicast';
}

export function extractUrls(input: unknown) {
  const found = new Set<string>();
  const pending: unknown[] = [input];
  while (pending.length && found.size < 100) {
    const value = pending.pop();
    if (typeof value === 'string') {
      const url = importUrl(value.trim());
      if (url) found.add(url.href);
    } else if (value && typeof value === 'object') {
      for (const item of Object.values(value).reverse()) pending.push(item);
    }
  }
  return [...found];
}
