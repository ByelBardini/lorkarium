/** Wraps a dynamic `import()` so the chunk is fetched on the first call only and shared after;
 *  a failed fetch (the network dropped, a deploy removed the file) is forgotten, so the next call
 *  tries again instead of failing forever.
 *
 *  Example: `const loadBoard = chunkLoaderOf(() => import('@/renderer/pixi-board-renderer'))` */
export function chunkLoaderOf<T>(load: () => Promise<T>): () => Promise<T> {
  let loading: Promise<T> | null = null;
  return () => {
    loading ??= load().catch((error: unknown) => {
      loading = null;
      throw error;
    });
    return loading;
  };
}
