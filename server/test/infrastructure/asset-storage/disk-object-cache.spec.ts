import { createHash } from 'node:crypto';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { text } from 'node:stream/consumers';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DiskObjectCache } from '../../../src/infrastructure/asset-storage/disk-object-cache';
import { ClockFake } from '../../support/auth-fakes';

const START = new Date('2026-11-10T12:00:00Z');

let dir: string;
let clock: ClockFake;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'lorkarium-disk-cache-'));
  clock = new ClockFake(START);
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function cacheOf(maxBytes = 1024): Promise<DiskObjectCache> {
  const cache = new DiskObjectCache({ dir, maxBytes, clock });
  await cache.init();
  return cache;
}

function tick(): void {
  clock.current = new Date(clock.current.getTime() + 1000);
}

async function bodyOf(cache: DiskObjectCache, key: string): Promise<string | null> {
  const object = await cache.read(key);
  return object === null ? null : text(object.body);
}

/** A stream that hands over `chunk` and then breaks, like a socket dropped mid-download. */
function brokenStream(chunk: string): Readable {
  return new Readable({
    read() {
      this.push(chunk);
      this.destroy(new Error('socket hang up'));
    },
  });
}

const hashOf = (key: string): string => createHash('sha256').update(key).digest('hex');

describe('DiskObjectCache', () => {
  it('reads back the bytes, size and content type it wrote', async () => {
    const cache = await cacheOf();

    await cache.write('assets/u1', Readable.from([Buffer.from('abc')]), 3, 'image/webp');
    const object = await cache.read('assets/u1');

    expect(object).toMatchObject({ size: 3, contentType: 'image/webp' });
    expect(await text(object?.body ?? Readable.from([]))).toBe('abc');
  });

  it('finds what an earlier instance wrote after a restart, and counts it toward the ceiling', async () => {
    const before = await cacheOf(10);
    await before.writeBytes('assets/old', Buffer.from('1234'), 'image/png');

    const after = await cacheOf(10);
    tick();
    await after.writeBytes('assets/new', Buffer.from('12345678'), 'image/png');

    expect(await bodyOf(after, 'assets/new')).toBe('12345678');
    expect(await after.read('assets/old')).toBeNull();
  });

  it('evicts the least recently used object, with a read renewing the use', async () => {
    const cache = await cacheOf(10);
    await cache.writeBytes('a', Buffer.from('aaaa'), 'image/png');
    tick();
    await cache.writeBytes('b', Buffer.from('bbbb'), 'image/png');
    tick();
    await bodyOf(cache, 'a');
    tick();

    await cache.writeBytes('c', Buffer.from('cccc'), 'image/png');

    expect(await cache.read('b')).toBeNull();
    expect(await bodyOf(cache, 'a')).toBe('aaaa');
    expect(await bodyOf(cache, 'c')).toBe('cccc');
  });

  it('keeps nothing of an object larger than the ceiling', async () => {
    const cache = await cacheOf(10);

    await cache.write('big', Readable.from([Buffer.alloc(11)]), 11, 'image/png');

    expect(await cache.read('big')).toBeNull();
    expect(await readdir(dir)).toStrictEqual([]);
  });

  it('names the file by the SHA-256 of the key, so a key with ../ stays inside the folder', async () => {
    const cache = await cacheOf();
    const escapee = `lorkarium-escapee-${path.basename(dir)}`;
    const key = `../${escapee}`;

    await cache.writeBytes(key, Buffer.from('x'), 'image/png');

    expect((await readdir(dir)).sort()).toStrictEqual(
      [`${hashOf(key)}.bin`, `${hashOf(key)}.json`].sort(),
    );
    const outside = (await readdir(path.dirname(dir))).filter((n) => n.startsWith(escapee));
    expect(outside).toStrictEqual([]);
  });

  it('cleans what a crash left on boot: temporaries, data without metadata and the reverse', async () => {
    const before = await cacheOf();
    await before.writeBytes('assets/kept', Buffer.from('ok'), 'image/png');
    await writeFile(path.join(dir, `${hashOf('half')}.1234.tmp`), 'partial');
    await writeFile(path.join(dir, `${hashOf('no-meta')}.bin`), 'data');
    await writeFile(path.join(dir, `${hashOf('no-data')}.json`), '{}');

    const after = await cacheOf();

    expect((await readdir(dir)).sort()).toStrictEqual(
      [`${hashOf('assets/kept')}.bin`, `${hashOf('assets/kept')}.json`].sort(),
    );
    expect(await bodyOf(after, 'assets/kept')).toBe('ok');
  });

  it('rejects a stream that breaks midway and leaves no temporary behind', async () => {
    const cache = await cacheOf();

    await expect(cache.write('assets/u1', brokenStream('ab'), 3, 'image/png')).rejects.toThrow(
      /socket hang up/,
    );

    expect(await cache.read('assets/u1')).toBeNull();
    expect(await readdir(dir)).toStrictEqual([]);
  });

  it('rejects a stream shorter than the announced size, citing both sizes', async () => {
    const cache = await cacheOf();

    const write = cache.write('assets/u1', Readable.from([Buffer.from('ab')]), 3, 'image/png');

    await expect(write).rejects.toThrow(/"assets\/u1".*2 bytes.*expected 3 bytes/);
    expect(await cache.read('assets/u1')).toBeNull();
    expect(await readdir(dir)).toStrictEqual([]);
  });

  it('deletes the data and the metadata, and deleting a missing key does not fail', async () => {
    const cache = await cacheOf();
    await cache.writeBytes('assets/u1', Buffer.from('abc'), 'image/png');

    await cache.delete('assets/u1');
    await cache.delete('assets/never');

    expect(await cache.read('assets/u1')).toBeNull();
    expect(await readdir(dir)).toStrictEqual([]);
  });
});
