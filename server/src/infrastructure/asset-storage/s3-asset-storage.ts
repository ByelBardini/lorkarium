import type { Readable } from 'node:stream';
import {
  type BucketLocationConstraint,
  CreateBucketCommand,
  type CreateBucketCommandInput,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  type S3Client,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import type { StorageConfig } from '../../config/env';
import type { AssetStoragePort, StoredObject } from '../../modules/assets/asset-storage.port';
import { s3ClientOf, s3ErrorNameOf, s3FailureReasonOf } from '../s3/s3-client';

const NOT_FOUND = 404;
const DEFAULT_REGION = 'us-east-1';

/** The CreateBucket request for a region; outside us-east-1 AWS demands the location.
 *
 *  Example: `createBucketInput('lk', 'sa-east-1')` */
export function createBucketInput(bucket: string, region: string): CreateBucketCommandInput {
  if (region === DEFAULT_REGION) return { Bucket: bucket };
  // The SDK's union lags behind new AWS regions; S3 itself validates the name.
  const LocationConstraint = region as BucketLocationConstraint;
  return { Bucket: bucket, CreateBucketConfiguration: { LocationConstraint } };
}

/** A storage call that failed for a reason other than "not there"; never carries the secret. */
export class AssetStorageError extends Error {
  constructor(operation: string, config: StorageConfig, cause: unknown) {
    super(
      `S3 ${operation} on bucket "${config.bucket}" at ${config.endpoint} failed: ${s3FailureReasonOf(cause)}`,
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
    this.client = s3ClientOf(config);
  }

  async ensureBucket(): Promise<void> {
    const Bucket = this.config.bucket;
    const exists = await this.client.send(new HeadBucketCommand({ Bucket })).then(
      () => true,
      (error: unknown) => (isNotFound(error) ? false : this.fail('HeadBucket', error)),
    );
    if (exists) return;
    await this.client
      .send(new CreateBucketCommand(createBucketInput(Bucket, this.config.region)))
      .catch((error: unknown) => {
        if (s3ErrorNameOf(error) !== 'BucketAlreadyOwnedByYou') this.fail('CreateBucket', error);
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
  const name = s3ErrorNameOf(error);
  if (name === 'NotFound' || name === 'NoSuchKey' || name === 'NoSuchBucket') return true;
  return error instanceof S3ServiceException && error.$metadata.httpStatusCode === NOT_FOUND;
}
