import { describe, expect, it } from 'vitest';
import { chunkLoaderOf } from '@/lib/chunk-loader';

type BoardModule = Readonly<{ name: string }>;

/** A dynamic `import()` stand-in: counts its loads and fails while `failing`. */
class ChunkImportFake {
  loads = 0;
  failing = false;

  readonly load = async (): Promise<BoardModule> => {
    this.loads += 1;
    if (this.failing) throw new TypeError('Failed to fetch dynamically imported module');
    return { name: `board #${this.loads}` };
  };
}

describe('chunkLoaderOf', () => {
  it('nothing is loaded before the first call', () => {
    const chunk = new ChunkImportFake();

    chunkLoaderOf(chunk.load);

    expect(chunk.loads).toBe(0);
  });

  it('the first call loads the chunk; the next ones reuse it', async () => {
    const chunk = new ChunkImportFake();
    const loadBoard = chunkLoaderOf(chunk.load);

    const first = await loadBoard();
    const second = await loadBoard();

    expect(chunk.loads).toBe(1);
    expect(second).toBe(first);
  });

  it('two calls before the chunk arrives share one load', async () => {
    const chunk = new ChunkImportFake();
    const loadBoard = chunkLoaderOf(chunk.load);

    await Promise.all([loadBoard(), loadBoard()]);

    expect(chunk.loads).toBe(1);
  });

  it('a failed load is not kept: the next call loads again', async () => {
    const chunk = new ChunkImportFake();
    chunk.failing = true;
    const loadBoard = chunkLoaderOf(chunk.load);

    await expect(loadBoard()).rejects.toThrow('Failed to fetch');
    chunk.failing = false;

    expect(await loadBoard()).toEqual({ name: 'board #2' });
  });
});
