import { once } from 'node:events';
import { Readable } from 'node:stream';
import { unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { FflateArchiveWriter } from '../../../src/infrastructure/archive/fflate-archive-writer';

const text = (value: string): Uint8Array => new TextEncoder().encode(value);

async function bytesOf(stream: Readable): Promise<Uint8Array> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk as Uint8Array));
  return new Uint8Array(Buffer.concat(chunks));
}

function decodedFilesOf(zip: Uint8Array): Record<string, string> {
  const files = unzipSync(zip);
  return Object.fromEntries(
    Object.entries(files).map(([path, bytes]) => [path, new TextDecoder().decode(bytes)]),
  );
}

describe('FflateArchiveWriter', () => {
  it('a file and a streamed file come back whole when the zip is opened', async () => {
    const archive = new FflateArchiveWriter().stream(async (zip) => {
      await zip.addFile('dados.json', text('{"a":1}'));
      await zip.addStream(
        'imagens/foto.webp',
        Readable.from([Buffer.from('RIFF'), Buffer.from('WEBP')]),
      );
    });

    const files = decodedFilesOf(await bytesOf(archive));

    expect(files).toEqual({ 'dados.json': '{"a":1}', 'imagens/foto.webp': 'RIFFWEBP' });
  });

  it('the first bytes leave before the last file is added (streamed, not built whole)', async () => {
    let release = (): void => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    const archive = new FflateArchiveWriter().stream(async (zip) => {
      await zip.addFile('LEIA-ME.txt', text('primeiro'));
      await gate;
      await zip.addFile('dados.json', text('{}'));
    });

    const [firstChunk] = (await once(archive, 'data')) as [Buffer];
    release();
    await bytesOf(archive);

    expect(firstChunk.byteLength).toBeGreaterThan(0);
  });

  it('a fill that fails makes the stream fail with the same error', async () => {
    const archive = new FflateArchiveWriter().stream(async (zip) => {
      await zip.addFile('dados.json', text('{}'));
      throw new Error('database went away');
    });

    await expect(bytesOf(archive)).rejects.toThrow('database went away');
  });

  it('a reader that goes away makes the next streamed file refuse instead of hanging', async () => {
    const big = Buffer.alloc(256 * 1024, 7);
    let outcome: Promise<void> = Promise.resolve();
    const archive = new FflateArchiveWriter().stream(async (zip) => {
      outcome = zip.addStream('imagens/grande.png', Readable.from([big, big, big, big]));
      await outcome;
    });
    await once(archive, 'readable');

    archive.destroy();

    await expect(outcome).rejects.toThrow('archive reader closed');
  });
});
