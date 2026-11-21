import { lookup } from 'node:dns/promises';
import { createWriteStream } from 'node:fs';
import { request as http } from 'node:http';
import { request as https } from 'node:https';
import { isIP } from 'node:net';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { importUrl, publicIp } from '../imports/import-urls';

const limit = 256 * 1024 ** 2;

export async function download(url: string, path: string) {
  const signal = AbortSignal.timeout(120_000);
  for (let redirects = 0; redirects <= 4; redirects++) {
    signal.throwIfAborted();
    const parsed = importUrl(url);
    if (!parsed) throw new Error('El destino de descarga no está permitido.');
    const host = parsed.hostname.replace(/^\[|\]$/g, '');
    const addresses = isIP(host) ? [{ address: host, family: isIP(host) }] : await lookup(host, { all: true });
    if (!addresses.length || addresses.some(({ address }) => !publicIp(address))) {
      throw new Error('La descarga apunta a una red no permitida.');
    }
    const chosen = addresses[0];
    const response = await new Promise<import('node:http').IncomingMessage>((resolve, reject) => {
      const request = parsed.protocol === 'https:' ? https : http;
      const req = request(parsed, {
        agent: false, family: chosen.family, signal,
        lookup: (_hostname, _options, callback) => callback(null, chosen.address, chosen.family),
        headers: { 'User-Agent': 'Nuvex', 'Accept-Encoding': 'identity' },
      }, resolve);
      req.on('error', reject);
      req.setTimeout(15_000, () => req.destroy(new Error('El servidor remoto no respondió a tiempo.')));
      req.end();
    });
    if ([301, 302, 303, 307, 308].includes(response.statusCode ?? 0) && response.headers.location) {
      response.destroy();
      url = new URL(response.headers.location, parsed).href;
      continue;
    }
    const type = (response.headers['content-type'] ?? 'application/octet-stream').split(';')[0].toLowerCase();
    if (response.statusCode !== 200 || ['text/html', 'application/xhtml+xml'].includes(type)) {
      response.destroy();
      throw new Error('El enlace no devolvió una descarga directa.');
    }
    if (Number(response.headers['content-length']) > limit) {
      response.destroy();
      throw new Error('El archivo excede el límite de importación.');
    }
    let length = 0;
    const cap = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        length += chunk.length;
        if (length > limit) callback(new Error('El archivo excede el límite de importación.'));
        else callback(null, chunk);
      },
    });
    await pipeline(response, cap, createWriteStream(path, { flags: 'wx' }), { signal });
    return { length, type, finalUrl: parsed };
  }
  throw new Error('El enlace excede el límite de redirecciones.');
}
