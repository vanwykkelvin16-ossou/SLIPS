export interface StoredObject {
  key: string;
  sizeBytes: number;
  contentType: string;
}

export interface PutObjectInput {
  /** Randomised, caller-supplied object key. Never derived from user input. */
  key: string;
  body: Buffer;
  contentType: string;
}

/**
 * Private object storage. Implementations must never expose objects publicly —
 * all reads go through short-lived signed URLs or authenticated server reads.
 */
export interface StorageAdapter {
  readonly name: string;
  presignedUploadUrl?(key: string, contentType: string, sizeBytes: number): Promise<string>;
  put(input: PutObjectInput): Promise<StoredObject>;
  /** Uploads straight from a file on disk so large exports are never buffered in memory. */
  putFile(key: string, filePath: string, contentType: string): Promise<StoredObject>;
  get(key: string): Promise<Buffer>;
  /** Node stream for large objects (exports) so they are never fully buffered. */
  getStream(key: string): Promise<NodeJS.ReadableStream>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  size(key: string): Promise<number>;
  /**
   * A time-limited URL for direct client download, when the driver supports it.
   * Drivers without native pre-signing return null and the caller falls back to
   * streaming through the authenticated application route.
   */
  presignedUrl(key: string, expiresInSeconds: number, downloadFilename?: string): Promise<string | null>;
}
