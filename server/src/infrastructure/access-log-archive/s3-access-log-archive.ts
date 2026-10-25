import { promisify } from 'node:util';
import { gzip } from 'node:zlib';
import { PutObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import type { StorageConfig } from '../../config/env';
import type { AccessLogArchivePort } from '../../modules/access-log/access-log-archive.port';
import { s3ClientOf, s3FailureReasonOf } from '../s3/s3-client';

const gzipped = promisify(gzip);

/** A batch the bucket refused; cites the bucket, the key and the S3 reason, never the secret. */
export class AccessLogArchiveError extends Error {
  constructor(key: string, config: StorageConfig, cause: unknown) {
    super(
      `S3 PutObject of "${key}" on bucket "${config.bucket}" at ${config.endpoint} failed: ${s3FailureReasonOf(cause)}`,
    );
    this.name = 'AccessLogArchiveError';
  }
}

/** `AccessLogArchivePort` over the AWS SDK: each batch one gzip object, written by `PutObject`
 *  alone, the only action the production IAM user has (see `docs/context/deploy/aws.md`).
 *
 *  Example: `await new S3AccessLogArchive(env.accessLog).store(key, jsonLines)` */
export class S3AccessLogArchive implements AccessLogArchivePort {
  private readonly client: S3Client;

  constructor(private readonly config: StorageConfig) {
    this.client = s3ClientOf(config);
  }

  async store(key: string, jsonLines: string): Promise<void> {
    const body = await gzipped(jsonLines);
    const command = new PutObjectCommand({
      Bucket: this.config.bucket,
      Key: key,
      Body: body,
      ContentType: 'application/gzip',
      ContentLength: body.byteLength,
    });
    await this.client.send(command).catch((error: unknown) => {
      throw new AccessLogArchiveError(key, this.config, error);
    });
  }

  /** Closes the client's keep-alive sockets; the app calls it on close, after the last batch. */
  destroy(): void {
    this.client.destroy();
  }
}
