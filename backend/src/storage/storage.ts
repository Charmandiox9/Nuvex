import {
  AbortMultipartUploadCommand, CompleteMultipartUploadCommand, CopyObjectCommand, CreateMultipartUploadCommand,
  DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, ListBucketsCommand, ListObjectsV2Command, ListPartsCommand, PutObjectCommand, S3Client, UploadPartCommand,
} from '@aws-sdk/client-s3';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { jpegHashMetadata, jpegSizeMetadata, restoreJpeg, sliceRestoredJpeg } from './jpeg-xl';

export const partSize = 8 * 1024 * 1024;
export const maxFileSize = 4 * 1024 ** 3;
export const quotaBytes = () => BigInt(process.env.NUVEX_QUOTA_BYTES ?? 100 * 1024 ** 3);

export class Storage {
  private readonly bucket = process.env.S3_BUCKET ?? 'nuvex';
  private readonly client = new S3Client({
    endpoint: process.env.S3_ENDPOINT ?? 'http://127.0.0.1:8333',
    region: 'us-east-1', forcePathStyle: true,
    requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED',
  });

  async start(key: string) {
    const result = await this.client.send(new CreateMultipartUploadCommand({ Bucket: this.bucket, Key: key }));
    if (!result.UploadId) throw new Error('S3 no devolvió un identificador de subida.');
    return result.UploadId;
  }

  putPart(key: string, id: string, part: number, body: Buffer) {
    return this.client.send(new UploadPartCommand({
      Bucket: this.bucket, Key: key, UploadId: id, PartNumber: part, Body: body,
    }));
  }

  async parts(key: string, id: string) {
    const parts: { PartNumber: number; ETag: string; Size: number }[] = [];
    let cursor: string | undefined;
    do {
      const page = await this.client.send(new ListPartsCommand({
        Bucket: this.bucket, Key: key, UploadId: id, PartNumberMarker: cursor,
      }));
      for (const item of page.Parts ?? []) {
        if (item.ETag && item.PartNumber && item.Size !== undefined) {
          parts.push({ ETag: item.ETag, PartNumber: item.PartNumber, Size: item.Size });
        }
      }
      cursor = page.NextPartNumberMarker;
    } while (cursor);
    return parts;
  }

  async complete(key: string, id: string, parts: Awaited<ReturnType<Storage['parts']>>) {
    await this.client.send(new CompleteMultipartUploadCommand({
      Bucket: this.bucket, Key: key, UploadId: id,
      MultipartUpload: { Parts: parts.map(({ ETag, PartNumber }) => ({ ETag, PartNumber })) },
    }));
  }

  abort(key: string, id: string) {
    return this.client.send(new AbortMultipartUploadCommand({ Bucket: this.bucket, Key: key, UploadId: id }));
  }

  head(key: string) {
    return this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async ping() {
    await this.client.send(new ListBucketsCommand({}));
  }

  read(key: string, range?: string, etag?: string) {
    return this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key, Range: range, IfMatch: etag }));
  }

  private async readOriginalObject(key: string, range?: string) {
    if (!range) return this.read(key);
    const head = await this.head(key);
    if (head.Metadata?.[jpegHashMetadata]) return this.read(key);
    try {
      return await this.read(key, range, head.ETag);
    } catch (error) {
      if (!(error instanceof Error) || error.name !== 'PreconditionFailed') throw error;
      // The original can only transition from raw JPEG to JPEG XL.
      return this.read(key);
    }
  }

  async readOriginal(key: string, range?: string) {
    let object = await this.readOriginalObject(key, range);
    let hash = object.Metadata?.[jpegHashMetadata];
    if (hash && object.ContentRange) {
      if (object.Body instanceof Readable) object.Body.destroy();
      object = await this.read(key);
      hash = object.Metadata?.[jpegHashMetadata];
    }
    const body = object.Body instanceof Readable ? object.Body : undefined;
    if (hash && body) {
      const jpeg = await restoreJpeg(body, Number(object.Metadata?.[jpegSizeMetadata]), hash);
      const { bytes, contentRange } = sliceRestoredJpeg(jpeg, range);
      return { Body: Readable.from([bytes]), ContentLength: bytes.length, ContentRange: contentRange, ETag: object.ETag, compressed: true };
    }
    return { Body: body, ContentLength: object.ContentLength, ContentRange: object.ContentRange, ETag: object.ETag, compressed: false };
  }

  replaceWithJpegXl(key: string, etag: string, bytes: Buffer, originalSize: number, originalHash: string) {
    return this.client.send(new PutObjectCommand({
      Bucket: this.bucket, Key: key, Body: bytes, ContentLength: bytes.length, IfMatch: etag,
      ChecksumSHA256: createHash('sha256').update(bytes).digest('base64'),
      Metadata: { [jpegHashMetadata]: originalHash, [jpegSizeMetadata]: String(originalSize) },
    }), { abortSignal: AbortSignal.timeout(30_000) });
  }

  put(key: string, body: Buffer | Readable, length: number) {
    return this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentLength: length }));
  }

  copy(from: string, to: string) {
    return this.client.send(new CopyObjectCommand({
      Bucket: this.bucket, Key: to, CopySource: this.bucket + '/' + from.split('/').map(encodeURIComponent).join('/'), MetadataDirective: 'COPY',
    }));
  }

  delete(key: string) {
    return this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async deletePrefix(prefix: string) {
    for (;;) {
      const page = await this.client.send(new ListObjectsV2Command({ Bucket: this.bucket, Prefix: prefix }));
      const keys = (page.Contents ?? []).flatMap((object) => object.Key ? [object.Key] : []);
      if (!keys.length) return;
      await Promise.all(keys.map((key) => this.delete(key)));
    }
  }
}
