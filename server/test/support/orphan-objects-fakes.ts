import type { AssetsDao } from '../../src/modules/assets/assets.dao';

/** The storage keys that still have a row in `assets`, whatever the table.
 *
 *  Example: `new AssetRowKeysFake(['assets/a'])` */
export class AssetRowKeysFake implements Pick<AssetsDao, 'storageKeysAmong'> {
  private readonly keys: ReadonlySet<string>;

  constructor(keys: readonly string[] = []) {
    this.keys = new Set(keys);
  }

  async storageKeysAmong(keys: readonly string[]): Promise<string[]> {
    return keys.filter((key) => this.keys.has(key));
  }
}
