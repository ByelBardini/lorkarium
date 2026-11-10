import type { AssetDto } from '@lorkarium/contracts';
import type { SheetAssetPo } from '../../src/modules/sheets/sheet-assets.po';
import type {
  SheetImageDaos,
  SheetImageWork,
  SheetImagesDeps,
} from '../../src/modules/sheets/sheet-images.service';
import { SheetHolderService } from '../../src/modules/sheets/sheet-holder.service';
import { SheetsHarness } from './sheets-fakes';

export const SHEET_IMAGE_ID = 'f1e2d3c4-b5a6-4978-8a9b-0c1d2e3f4a5b';

type SheetImageTies = SheetImageDaos['sheetAssets'];
type SheetImageIngest = SheetImagesDeps['assets'];

/** In-memory ties between images and sheets, per campaign; each tie goes to the journal. */
export class SheetAssetsDaoFake implements SheetImageTies {
  readonly rows: SheetAssetPo[] = [];
  constructor(private readonly journal: string[] = []) {}
  async associate(campaignId: string, sheetId: string, assetId: string): Promise<void> {
    this.journal.push(`associate ${assetId} to ${sheetId}`);
    const tied = this.rows.some(
      (row) => row.campaignId === campaignId && row.sheetId === sheetId && row.assetId === assetId,
    );
    if (!tied) this.rows.push({ campaignId, sheetId, assetId });
  }
  async sheetsOfAsset(campaignId: string, assetId: string): Promise<string[]> {
    return this.rows
      .filter((row) => row.campaignId === campaignId && row.assetId === assetId)
      .map((row) => row.sheetId);
  }
}

/** The assets service as the sheet images see it: writes 'upload' and answers `SHEET_IMAGE_ID`;
 *  `meanwhile` runs while the image is being kept (a right lost during the upload). */
export class SheetImageIngestFake implements SheetImageIngest {
  readonly sent: Readonly<{ userId: string; campaignId: string; bytes: Uint8Array }>[] = [];
  meanwhile: () => void = () => undefined;
  constructor(private readonly journal: string[]) {}
  async uploadSheetImage(userId: string, campaignId: string, bytes: Uint8Array): Promise<AssetDto> {
    this.journal.push('upload');
    this.sent.push({ userId, campaignId, bytes });
    this.meanwhile();
    return { id: SHEET_IMAGE_ID, mimeType: 'image/png', width: 640, height: 480 };
  }
}

/** The sheets harness (Vharn with Ana, Bia, Caio, Duda; Lyra's sheet on demand; Quelm's sheet)
 *  plus the image ties, as one set of DAOs for the snapshot and the transaction. */
export class SheetImagesHarness extends SheetsHarness {
  readonly sheetAssets = new SheetAssetsDaoFake(this.journal);
  readonly ingest = new SheetImageIngestFake(this.journal);
  readonly imageDaos: SheetImageDaos = {
    members: this.members,
    campaigns: this.daos.campaigns,
    sheets: this.sheets,
    sheetAssets: this.sheetAssets,
  };
  readonly work: SheetImageWork = (work) => work(this.imageDaos);
  readonly imageDeps: SheetImagesDeps = {
    snapshot: this.work,
    transaction: this.work,
    holders: new SheetHolderService(),
    assets: this.ingest,
  };
}
