/** One object kept by the disk cache, as the eviction rule sees it. */
export type CachedEntry = Readonly<{ key: string; size: number; lastUsedAt: number }>;

/** What making room for a new object costs: the keys to evict, or a refusal. */
export type Eviction =
  Readonly<{ kind: 'fits'; evict: readonly string[] }> | Readonly<{ kind: 'too-large' }>;

/** The least recently used keys to drop so `incomingBytes` fits under `maxBytes`; a tie of use
 *  falls back to the key, so the same entries always give the same answer.
 *
 *  Example: `evictionFor([{ key: 'a', size: 100, lastUsedAt: 1 }], 100, 50) // evict ['a']` */
export function evictionFor(
  entries: readonly CachedEntry[],
  maxBytes: number,
  incomingBytes: number,
): Eviction {
  if (incomingBytes > maxBytes) return { kind: 'too-large' };
  let total = entries.reduce((sum, entry) => sum + entry.size, 0);
  const evict: string[] = [];
  for (const entry of [...entries].sort(byLeastRecentUse)) {
    if (total + incomingBytes <= maxBytes) break;
    evict.push(entry.key);
    total -= entry.size;
  }
  return { kind: 'fits', evict };
}

function byLeastRecentUse(left: CachedEntry, right: CachedEntry): number {
  if (left.lastUsedAt !== right.lastUsedAt) return left.lastUsedAt - right.lastUsedAt;
  if (left.key === right.key) return 0;
  return left.key < right.key ? -1 : 1;
}
