import type { AssetsDao } from '../../src/modules/assets/assets.dao';
import type { AssetPo } from '../../src/modules/assets/assets.po';
import type { KeptImageColumns } from '../../src/modules/assets/assets.dao';
import { AssetStorageFake } from './assets-fakes';

/** The PNG rows a recompression run walks; writes 'update:<id>' to the shared journal. */
export class RecompressAssetsDaoFake implements Pick<
  AssetsDao,
  'listPngImages' | 'updateKeptImage'
> {
  constructor(
    public rows: AssetPo[],
    private readonly journal: string[] = [],
  ) {}

  async listPngImages(): Promise<AssetPo[]> {
    return this.rows.filter((row) => row.mimeType === 'image/png');
  }

  async updateKeptImage(assetId: string, kept: KeptImageColumns): Promise<void> {
    this.journal.push(`update:${assetId}`);
    this.rows = this.rows.map((row) => (row.id === assetId ? { ...row, ...kept } : row));
  }
}

/** A bucket whose every `put` fails like an S3 outage. */
export class FailingPutStorageFake extends AssetStorageFake {
  override async put(key: string): Promise<void> {
    throw new Error(`PutObject on ${key} failed with 503 SlowDown`);
  }
}
