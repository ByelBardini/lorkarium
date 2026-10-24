import type { Readable } from 'node:stream';
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import type { StorageConfig } from '../../config/env';
import type { AssetStoragePort, StoredObject } from '../../modules/assets/asset-storage.port';

const NOT_FOUND = 404;

/** A storage call that failed for a reason other than "not there"; never carries the secret. */
export class AssetStorageError extends Error {
  constructor(operation: string, config: StorageConfig, cause: unknown) {
    super(
      `S3 ${operation} on bucket "${config.bucket}" at ${config.endpoint} failed: ${reasonOf(cause)}`,
    );
    this.name = 'AssetStorageError';
  }
}

/** `AssetStoragePort` over the AWS SDK; works with SeaweedFS, MinIO, R2 and AWS itself.
 *
 *  Example: `await new S3AssetStorage(env.storage).ensureBucket()` */
export class S3AssetStorage implements AssetStoragePort {
  private readonly client: S3Client;

  constructor(private readonly config: StorageConfig) {
    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      forcePathStyle: config.forcePathStyle,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
      // S3-compatible services (SeaweedFS, R2, B2) do not all accept the SDK's default CRC32 headers.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
  }

  async ensureBucket(): Promise<void> {
    const Bucket = this.config.bucket;
    const exists = await this.client.send(new HeadBucketCommand({ Bucket })).then(
      () => true,
      (error: unknown) => (isNotFound(error) ? false : this.fail('HeadBucket', error)),
    );
    if (exists) return;
    await this.client.send(new CreateBucketCommand({ Bucket })).catch((error: unknown) => {
      if (nameOf(error) !== 'BucketAlreadyOwnedByYou') this.fail('CreateBucket', error);
    });
  }

  async put(key: string, bytes: Uint8Array, contentType: string): Promise<void> {
    const command = new PutObjectCommand({
      Bucket: this.config.bucket,
      Key: key,
      Body: bytes,
      ContentType: contentType,
      ContentLength: bytes.byteLength,
    });
    await this.client.send(command).catch((error: unknown) => this.fail('PutObject', error));
  }

  async open(key: string): Promise<StoredObject | null> {
    const command = new GetObjectCommand({ Bucket: this.config.bucket, Key: key });
    const object = await this.client.send(command).catch((error: unknown) => {
      if (isNotFound(error)) return null;
      return this.fail('GetObject', error);
    });
    if (object?.Body === undefined) return null;
    return {
      body: object.Body as Readable,
      size: object.ContentLength ?? 0,
      contentType: object.ContentType ?? 'application/octet-stream',
    };
  }

  // S3 answers 204 for a key that holds nothing, so deleting twice is fine.
  async remove(key: string): Promise<void> {
    const command = new DeleteObjectCommand({ Bucket: this.config.bucket, Key: key });
    await this.client.send(command).catch((error: unknown) => {
      if (!isNotFound(error)) this.fail('DeleteObject', error);
    });
  }

  /** Closes the client's keep-alive sockets; the app calls it on close. */
  destroy(): void {
    this.client.destroy();
  }

  private fail(operation: string, cause: unknown): never {
    throw new AssetStorageError(operation, this.config, cause);
  }
}

function isNotFound(error: unknown): boolean {
  const name = nameOf(error);
  if (name === 'NotFound' || name === 'NoSuchKey' || name === 'NoSuchBucket') return true;
  return error instanceof S3ServiceException && error.$metadata.httpStatusCode === NOT_FOUND;
}

function nameOf(error: unknown): string {
  return error instanceof Error ? error.name : String(error);
}

function reasonOf(cause: unknown): string {
  if (!(cause instanceof S3ServiceException)) return nameOf(cause);
  return `${cause.name} (HTTP ${String(cause.$metadata.httpStatusCode)})`;
}
