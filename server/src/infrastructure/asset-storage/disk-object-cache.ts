import { createHash, randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, open, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ClockPort } from '../../modules/auth/clock.port';
import type { StoredObject } from '../../modules/assets/asset-storage.port';
import { type CachedEntry, evictionFor } from './cache-eviction';

/** A local copy of the storage objects; what `DiskCachedAssetStorage` consumes. Every key holds
 *  bytes that never change, so a copy never goes stale. */
export interface ObjectCache {
  /** `null` when the key is not kept (never written, evicted, or too large to keep). */
  read(key: string): Promise<StoredObject | null>;
  /** Streams `body` to disk; an object above the ceiling is discarded and not kept. Rejects when
   *  the stream breaks or brings other than `size` bytes, leaving nothing behind. */
  write(key: string, body: Readable, size: number, contentType: string): Promise<void>;
  writeBytes(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  /** A key that is not kept is not an error. */
  delete(key: string): Promise<void>;
}

export type DiskObjectCacheOptions = Readonly<{ dir: string; maxBytes: number; clock: ClockPort }>;

type IndexedObject = CachedEntry & Readonly<{ contentType: string }>;

type ObjectMeta = Readonly<{ key: string; size: number; contentType: string }>;

const DATA = '.bin';
const META = '.json';
const TEMPORARY = '.tmp';

/** `ObjectCache` in one folder: `<sha256 of key>.bin` + `.json`, published by temporary file and
 *  `rename` (never a half-written file), with an in-memory index rebuilt by `init`.
 *
 *  Example: `const cache = new DiskObjectCache({ dir, maxBytes, clock }); await cache.init()` */
export class DiskObjectCache implements ObjectCache {
  private readonly index = new Map<string, IndexedObject>();

  constructor(private readonly options: DiskObjectCacheOptions) {}

  /** Creates the folder, drops what a crash left behind and indexes what survived. */
  async init(): Promise<void> {
    await mkdir(this.options.dir, { recursive: true });
    const names = await readdir(this.options.dir);
    await Promise.all(names.filter((name) => !isPublished(name, names)).map((n) => this.rmFile(n)));
    const hashes = names.filter((name) => name.endsWith(DATA) && isPublished(name, names));
    for (const name of hashes) await this.indexFromDisk(name.slice(0, -DATA.length));
    await this.evict(evictionFor([...this.index.values()], this.options.maxBytes, 0));
  }

  async read(key: string): Promise<StoredObject | null> {
    const entry = this.index.get(key);
    if (entry === undefined) return null;
    const file = await open(this.pathOf(key, DATA), 'r').catch(() => null);
    if (file === null) {
      await this.delete(key);
      return null;
    }
    this.index.set(key, { ...entry, lastUsedAt: this.now() });
    return { body: file.createReadStream(), size: entry.size, contentType: entry.contentType };
  }

  async write(key: string, body: Readable, size: number, contentType: string): Promise<void> {
    if (size > this.options.maxBytes) {
      body.destroy();
      return;
    }
    const temporary = this.temporaryOf(key);
    await this.download(key, body, size, temporary);
    const others = [...this.index.values()].filter((entry) => entry.key !== key);
    await this.evict(evictionFor(others, this.options.maxBytes, size));
    await this.publish(temporary, { key, size, contentType });
  }

  async writeBytes(key: string, bytes: Uint8Array, contentType: string): Promise<void> {
    await this.write(key, Readable.from([Buffer.from(bytes)]), bytes.byteLength, contentType);
  }

  async delete(key: string): Promise<void> {
    this.index.delete(key);
    await Promise.all([rm(this.pathOf(key, DATA), { force: true }), this.rmMeta(key)]);
  }

  private async download(key: string, body: Readable, size: number, temporary: string) {
    try {
      await pipeline(body, createWriteStream(temporary));
      const written = (await stat(temporary)).size;
      if (written !== size) throw new ShortObjectError(key, written, size);
    } catch (error) {
      await rm(temporary, { force: true });
      throw error;
    }
  }

  // Data first, metadata last: `init` drops data without metadata, so a crash in between
  // leaves nothing that looks published.
  private async publish(temporary: string, meta: ObjectMeta): Promise<void> {
    await rename(temporary, this.pathOf(meta.key, DATA));
    const metaTemporary = this.temporaryOf(meta.key);
    await writeFile(metaTemporary, JSON.stringify(meta));
    await rename(metaTemporary, this.pathOf(meta.key, META));
    this.index.set(meta.key, { ...meta, lastUsedAt: this.now() });
  }

  private async evict(eviction: ReturnType<typeof evictionFor>): Promise<void> {
    if (eviction.kind === 'too-large') return;
    await Promise.all(eviction.evict.map((key) => this.delete(key)));
  }

  // The data file's mtime stands for the last use across a restart.
  private async indexFromDisk(hash: string): Promise<void> {
    const meta = await this.metaOf(hash);
    const data = await stat(this.fileOf(hash, DATA)).catch(() => null);
    if (meta === null || data === null || data.size !== meta.size) {
      await Promise.all([this.rmFile(hash + DATA), this.rmFile(hash + META)]);
      return;
    }
    this.index.set(meta.key, { ...meta, lastUsedAt: data.mtimeMs });
  }

  private async metaOf(hash: string): Promise<ObjectMeta | null> {
    const raw = await readFile(this.fileOf(hash, META), 'utf8').catch(() => null);
    if (raw === null) return null;
    const meta = parseMeta(raw);
    return meta !== null && hashOf(meta.key) === hash ? meta : null;
  }

  private rmMeta(key: string): Promise<void> {
    return rm(this.pathOf(key, META), { force: true });
  }

  private rmFile(name: string): Promise<void> {
    return rm(path.join(this.options.dir, name), { force: true });
  }

  private pathOf(key: string, extension: string): string {
    return this.fileOf(hashOf(key), extension);
  }

  private fileOf(hash: string, extension: string): string {
    return path.join(this.options.dir, hash + extension);
  }

  private temporaryOf(key: string): string {
    return this.pathOf(key, `.${randomUUID()}${TEMPORARY}`);
  }

  private now(): number {
    return this.options.clock.now().getTime();
  }
}

/** The storage announced one size and the stream brought another. */
export class ShortObjectError extends Error {
  constructor(key: string, written: number, expected: number) {
    super(
      `The cached copy of "${key}" got ${written} bytes; expected ${expected} bytes (the size the storage announced)`,
    );
    this.name = 'ShortObjectError';
  }
}

// The file name is a hash: the key (`assets/<uuid>`) never becomes a path (spec §8.5).
function hashOf(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

// A pair `.bin` + `.json` is published; a temporary or half a pair is what a crash left.
function isPublished(name: string, names: readonly string[]): boolean {
  if (name.endsWith(DATA)) return names.includes(name.slice(0, -DATA.length) + META);
  if (name.endsWith(META)) return names.includes(name.slice(0, -META.length) + DATA);
  return false;
}

function parseMeta(raw: string): ObjectMeta | null {
  try {
    const value: unknown = JSON.parse(raw);
    return isObjectMeta(value) ? value : null;
  } catch {
    return null;
  }
}

function isObjectMeta(value: unknown): value is ObjectMeta {
  if (typeof value !== 'object' || value === null) return false;
  const { key, size, contentType } = value as Record<string, unknown>;
  return typeof key === 'string' && typeof contentType === 'string' && Number.isInteger(size);
}
