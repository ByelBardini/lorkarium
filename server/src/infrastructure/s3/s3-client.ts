import { S3Client, S3ServiceException } from '@aws-sdk/client-s3';
import type { StorageConfig } from '../../config/env';

/** The SDK client of one bucket's config; shared by the asset storage and the access log archive.
 *
 *  Example: `const client = s3ClientOf(env.storage)` */
export function s3ClientOf(config: StorageConfig): S3Client {
  return new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    forcePathStyle: config.forcePathStyle,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    // S3-compatible services (SeaweedFS, R2, B2) do not all accept the SDK's default CRC32 headers.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });
}

/** The error's name (`NoSuchBucket`, `AccessDenied`), or the value itself when it is no error.
 *
 *  Example: `s3ErrorNameOf(new Error('x')) // 'Error'` */
export function s3ErrorNameOf(error: unknown): string {
  return error instanceof Error ? error.name : String(error);
}

/** Why an S3 call failed, for an error message: the S3 code and HTTP status, never the request.
 *
 *  Example: `s3FailureReasonOf(accessDenied) // 'AccessDenied (HTTP 403)'` */
export function s3FailureReasonOf(cause: unknown): string {
  if (!(cause instanceof S3ServiceException)) return s3ErrorNameOf(cause);
  return `${cause.name} (HTTP ${String(cause.$metadata.httpStatusCode)})`;
}
