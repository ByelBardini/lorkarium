import { Readable } from 'node:stream';
import type { ObjectCache } from '../../src/infrastructure/asset-storage/disk-object-cache';
import type { StoredObject } from '../../src/modules/assets/asset-storage.port';
import { AssetStorageFake } from './assets-fakes';

type KeptObject = Readonly<{ bytes: Uint8Array; contentType: string }>;

/** Reads a whole stream into one buffer. Example: `const bytes = await drained(object.body)` */
export async function drained(body: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of body) chunks.push(Buffer.from(chunk as Uint8Array));
  return Buffer.concat(chunks);
}

/** An object cache in memory with no ceiling; records every write and delete by key. */
export class ObjectCacheMemoryFake implements ObjectCache {
  readonly kept = new Map<string, KeptObject>();
  readonly writes: string[] = [];
  readonly deletes: string[] = [];

  async read(key: string): Promise<StoredObject | null> {
    const object = this.kept.get(key);
    if (object === undefined) return null;
    const body = Readable.from([Buffer.from(object.bytes)]);
    return { body, size: object.bytes.byteLength, contentType: object.contentType };
  }

  async write(key: string, body: Readable, size: number, contentType: string): Promise<void> {
    const bytes = await drained(body);
    if (bytes.byteLength !== size) {
      throw new Error(`cache write of ${key} got ${bytes.byteLength} bytes; expected ${size}`);
    }
    await this.writeBytes(key, bytes, contentType);
  }

  async writeBytes(key: string, bytes: Uint8Array, contentType: string): Promise<void> {
    this.writes.push(key);
    this.kept.set(key, { bytes, contentType });
  }

  async delete(key: string): Promise<void> {
    this.deletes.push(key);
    this.kept.delete(key);
  }
}

export type CacheFailurePlan = Readonly<{
  read?: boolean;
  write?: boolean;
  writeBytes?: boolean;
  delete?: boolean;
}>;

/** A broken disk: each operation in the plan rejects with `error`. A failing `write` takes the
 *  first chunk of the body before rejecting, as a disk that fills up mid-copy would. */
export class ObjectCacheFailingFake extends ObjectCacheMemoryFake {
  readonly error = new Error('ENOSPC: no space left on device (expected room for the object)');

  constructor(private readonly plan: CacheFailurePlan) {
    super();
  }

  override async read(key: string): Promise<StoredObject | null> {
    if (this.plan.read === true) throw this.error;
    return super.read(key);
  }

  override async write(key: string, body: Readable, size: number, type: string): Promise<void> {
    if (this.plan.write !== true) return super.write(key, body, size, type);
    await body[Symbol.asyncIterator]().next();
    throw this.error;
  }

  override async writeBytes(key: string, bytes: Uint8Array, type: string): Promise<void> {
    if (this.plan.writeBytes === true) throw this.error;
    return super.writeBytes(key, bytes, type);
  }

  override async delete(key: string): Promise<void> {
    if (this.plan.delete === true) throw this.error;
    return super.delete(key);
  }
}

/** The in-memory bucket counting each `ensureBucket` and keeping each body `open` handed out;
 *  with `openFailure` set, `open` throws it. */
export class CountingAssetStorageFake extends AssetStorageFake {
  ensures = 0;
  opens = 0;
  readonly bodies: Readable[] = [];
  openFailure: Error | null = null;

  override async ensureBucket(): Promise<void> {
    this.ensures += 1;
  }

  override async open(key: string): Promise<StoredObject | null> {
    this.opens += 1;
    if (this.openFailure !== null) throw this.openFailure;
    const object = await super.open(key);
    if (object !== null) this.bodies.push(object.body);
    return object;
  }
}
