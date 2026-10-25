import { randomUUID } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readEnv } from '../../src/config/env';
import { S3AccessLogArchive } from '../../src/infrastructure/access-log-archive/s3-access-log-archive';
import { S3AssetStorage } from '../../src/infrastructure/asset-storage/s3-asset-storage';
import { bytesOf } from '../support/streams';

// The bucket of the asset storage, which can create it and read back what the archive wrote.
const config = readEnv(process.env).storage;
const LINES =
  '{"kind":"http","ip":"203.0.113.7"}\n{"kind":"realtime-connect","ip":"203.0.113.7"}\n';

describe('S3AccessLogArchive', () => {
  const storage = new S3AssetStorage(config);
  const opened: S3AccessLogArchive[] = [];

  function archiveWith(secretAccessKey = config.secretAccessKey): S3AccessLogArchive {
    const archive = new S3AccessLogArchive({ ...config, secretAccessKey });
    opened.push(archive);
    return archive;
  }

  beforeAll(() => storage.ensureBucket());

  afterAll(() => {
    for (const archive of opened) archive.destroy();
    storage.destroy();
  });

  it('a batch is stored gzip-compressed under its key and gunzips to the same lines', async () => {
    const key = `access-log/2026/10/25/030405Z-${randomUUID().slice(0, 8)}-0.jsonl.gz`;

    await archiveWith().store(key, LINES);

    const object = await storage.open(key);
    expect(object?.contentType).toBe('application/gzip');
    expect(gunzipSync(await bytesOf(object!.body)).toString('utf8')).toBe(LINES);
  });

  it('the empty boot marker is a valid gzip of nothing', async () => {
    const key = `access-log/boots/2026/10/25/030405Z-${randomUUID().slice(0, 8)}.jsonl.gz`;

    await archiveWith().store(key, '');

    const object = await storage.open(key);
    expect(gunzipSync(await bytesOf(object!.body)).toString('utf8')).toBe('');
  });

  it('a wrong secret fails citing the key and the bucket, never the secret', async () => {
    const secret = 'not-the-dev-secret';
    const key = 'access-log/boots/2026/10/25/030405Z-wrong.jsonl.gz';

    const failure = await archiveWith(secret)
      .store(key, LINES)
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(Error);
    const message = (failure as Error).message;
    expect(message).toContain(key);
    expect(message).toContain(config.bucket);
    expect(message).not.toContain(secret);
  });
});
