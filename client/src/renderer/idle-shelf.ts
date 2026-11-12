/** What the view stopped drawing, kept a while instead of freed at once: a token that leaves the
 *  sight and comes back inside the slack costs no new load nor decode. Past `limit` the oldest
 *  shelved value is evicted (`evict` frees it). Pure: no PixiJS, no clock.
 *
 *  Example: `const shelf = new IdleShelf<Texture>(64, (url) => Assets.unload(url)); shelf.shelve(url, texture); shelf.takeBack(url)` */
export class IdleShelf<V> {
  private readonly shelved = new Map<string, V>();

  constructor(
    private readonly limit: number,
    private readonly evict: (key: string, value: V) => void,
  ) {
    if (Number.isInteger(limit) && limit >= 0) return;
    throw new RangeError(`idle shelf limit: expected an integer ≥ 0, got ${String(limit)}`);
  }

  /** Puts `value` on the shelf as the newest; evicts the oldest past the limit. */
  shelve(key: string, value: V): void {
    this.shelved.delete(key);
    this.shelved.set(key, value);
    this.trim();
  }

  /** Takes `key` off the shelf (back into use), or `undefined` when it is not there. */
  takeBack(key: string): V | undefined {
    const value = this.shelved.get(key);
    this.shelved.delete(key);
    return value;
  }

  /** How many values wait on the shelf. */
  size(): number {
    return this.shelved.size;
  }

  /** Evicts everything (the renderer going away). */
  clear(): void {
    const all = [...this.shelved];
    this.shelved.clear();
    for (const [key, value] of all) this.evict(key, value);
  }

  private trim(): void {
    for (const [key, value] of this.shelved) {
      if (this.shelved.size <= this.limit) return;
      this.shelved.delete(key);
      this.evict(key, value);
    }
  }
}
