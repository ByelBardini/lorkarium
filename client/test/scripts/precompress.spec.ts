import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { brotliDecompressSync, gunzipSync } from 'node:zlib';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { precompressBuild } from '../../scripts/precompress';

const BIG = 'export const lorkarium = "mesa";\n'.repeat(64);
const SMALL = 'export {};\n';

async function filesOf(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) =>
      path.relative(dir, path.join(entry.parentPath, entry.name)).replaceAll('\\', '/'),
    )
    .sort();
}

describe('precompressBuild', () => {
  let dist: string;

  beforeEach(async () => {
    dist = await mkdtemp(path.join(tmpdir(), 'lorkarium-precompress-'));
    await mkdir(path.join(dist, 'assets'));
  });

  afterEach(async () => {
    await rm(dist, { recursive: true, force: true });
  });

  it('a script above 1 KB gets a .br and a .gz that decompress back to it', async () => {
    await writeFile(path.join(dist, 'assets', 'app-3f2a.js'), BIG);

    await precompressBuild(dist);

    const br = await readFile(path.join(dist, 'assets', 'app-3f2a.js.br'));
    const gz = await readFile(path.join(dist, 'assets', 'app-3f2a.js.gz'));
    expect(brotliDecompressSync(br).toString()).toBe(BIG);
    expect(gunzipSync(gz).toString()).toBe(BIG);
  });

  it.each(['index.html', 'assets/app.css', 'logo.svg', 'manifest.webmanifest.json'])(
    '%s, a text file above 1 KB, is compressed too',
    async (name) => {
      await writeFile(path.join(dist, name), BIG);

      await precompressBuild(dist);

      expect(await filesOf(dist)).toEqual(expect.arrayContaining([`${name}.br`, `${name}.gz`]));
    },
  );

  it('a file of 1 KB or less, an image and a font are left alone', async () => {
    await writeFile(path.join(dist, 'assets', 'tiny.js'), SMALL);
    await writeFile(path.join(dist, 'assets', 'exactly.js'), 'x'.repeat(1024));
    await writeFile(path.join(dist, 'assets', 'art.png'), BIG);
    await writeFile(path.join(dist, 'assets', 'font.woff2'), BIG);

    await precompressBuild(dist);

    expect(await filesOf(dist)).toEqual([
      'assets/art.png',
      'assets/exactly.js',
      'assets/font.woff2',
      'assets/tiny.js',
    ]);
  });

  it('running it twice compresses no .br or .gz again', async () => {
    await writeFile(path.join(dist, 'assets', 'app.js'), BIG);

    await precompressBuild(dist);
    await precompressBuild(dist);

    expect(await filesOf(dist)).toEqual(['assets/app.js', 'assets/app.js.br', 'assets/app.js.gz']);
  });

  it('answers the files it compressed, relative to the build', async () => {
    await writeFile(path.join(dist, 'index.html'), BIG);
    await writeFile(path.join(dist, 'assets', 'app.js'), BIG);

    expect([...(await precompressBuild(dist))].sort()).toEqual(['assets/app.js', 'index.html']);
  });
});
