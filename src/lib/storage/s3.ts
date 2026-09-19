import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { PutObjectInput, StorageAdapter, StoredObject } from './types';

export interface S3AdapterConfig {
  bucket: string;
  region: string;
  endpoint?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  forcePathStyle?: boolean;
}

/**
 * S3-compatible private storage (AWS S3, Cloudflare R2, Backblaze B2, MinIO).
 * The bucket must have all public access blocked — documents are only reachable
 * through pre-signed, time-limited URLs issued after an ownership check.
 */
export class S3StorageAdapter implements StorageAdapter {
  readonly name = 's3';
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config: S3AdapterConfig) {
    this.bucket = config.bucket;
    this.client = new S3Client({
      region: config.region,
      ...(config.endpoint ? { endpoint: config.endpoint } : {}),
      ...(config.forcePathStyle ? { forcePathStyle: true } : {}),
      ...(config.accessKeyId && config.secretAccessKey
        ? { credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey } }
        : {}),
    });
  }

  async put({ key, body, contentType }: PutObjectInput): Promise<StoredObject> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        ServerSideEncryption: 'AES256',
      }),
    );
    return { key, sizeBytes: body.byteLength, contentType };
  }

  async putFile(key: string, filePath: string, contentType: string): Promise<StoredObject> {
    const { createReadStream } = await import('node:fs');
    const { stat } = await import('node:fs/promises');
    const info = await stat(filePath);

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: createReadStream(filePath),
        ContentLength: info.size,
        ContentType: contentType,
        ServerSideEncryption: 'AES256',
      }),
    );

    return { key, sizeBytes: info.size, contentType };
  }

  async get(key: string): Promise<Buffer> {
    const result = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    const bytes = await result.Body?.transformToByteArray();
    if (!bytes) throw new Error(`Object not found: ${key}`);
    return Buffer.from(bytes);
  }

  async getStream(key: string): Promise<NodeJS.ReadableStream> {
    const result = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    if (!result.Body) throw new Error(`Object not found: ${key}`);
    return result.Body as unknown as NodeJS.ReadableStream;
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch {
      return false;
    }
  }

  async size(key: string): Promise<number> {
    const head = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
    return head.ContentLength ?? 0;
  }

  async presignedUrl(key: string, expiresInSeconds: number, downloadFilename?: string): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ...(downloadFilename
        ? { ResponseContentDisposition: `attachment; filename="${downloadFilename.replace(/["\\]/g, '')}"` }
        : {}),
    });
    return getSignedUrl(this.client, command, { expiresIn: expiresInSeconds });
  }
}
