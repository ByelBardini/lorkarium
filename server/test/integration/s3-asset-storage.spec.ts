import { randomUUID } from 'node:crypto';
import type { Readable } from 'node:stream';
import { afterAll, describe, expect, it } from 'vitest';
import { readEnv } from '../../src/config/env';
import { S3AssetStorage } from '../../src/infrastructure/asset-storage/s3-asset-storage';

const config = readEnv(process.env).storage;
const PNG_BYTES = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

async function bytesOf(stream: Readable): Promise<Uint8Array> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk as Uint8Array));
  return new Uint8Array(Buffer.concat(chunks));
}

describe('S3AssetStorage', () => {
  const storage = new S3AssetStorage(config);
  const opened: S3AssetStorage[] = [storage];

  afterAll(() => {
    for (const each of opened) each.destroy();
  });

  it('an object put under a key opens with the same bytes, size and type', async () => {
    await storage.ensureBucket();
    const key = `assets/${randomUUID()}`;
    await storage.put(key, PNG_BYTES, 'image/png');

    const object = await storage.open(key);

    expect(object?.size).toBe(PNG_BYTES.length);
    expect(object?.contentType).toBe('image/png');
    expect(await bytesOf(object!.body)).toEqual(PNG_BYTES);
  });

  it('a bucket that did not exist is created, and ensuring it twice does not fail', async () => {
    const fresh = new S3AssetStorage({ ...config, bucket: `lorkarium-fresh-${randomUUID()}` });
    opened.push(fresh);

    await fresh.ensureBucket();
    await fresh.ensureBucket();
    await fresh.put('assets/one', PNG_BYTES, 'image/png');

    expect((await fresh.open('assets/one'))?.size).toBe(PNG_BYTES.length);
  });

  it('a key that was never put opens as null', async () => {
    await storage.ensureBucket();

    expect(await storage.open(`assets/${randomUUID()}`)).toBeNull();
  });

  it('a wrong secret fails citing the bucket and the endpoint, never the secret', async () => {
    const secretAccessKey = 'not-the-dev-secret';
    const wrong = new S3AssetStorage({ ...config, secretAccessKey });
    opened.push(wrong);

    const failure = await wrong
      .put('assets/x', PNG_BYTES, 'image/png')
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(Error);
    const message = (failure as Error).message;
    expect(message).toContain(config.bucket);
    expect(message).toContain(config.endpoint);
    expect(message).not.toContain(secretAccessKey);
  });
});
