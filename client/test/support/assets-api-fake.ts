import type { AssetDto, AssetPurposeDto } from '@lorkarium/contracts';
import type { AssetOutlineResult, AssetsResult, RoomAssetsApi } from '@/services/assets-api';
import { AssetOutlineApiFake } from './asset-outline-api-fake';

export const LYRA_PORTRAIT: AssetDto = {
  id: '4a3b2c1d-0e9f-4a8b-9c7d-6e5f4a3b2c1d',
  mimeType: 'image/png',
  width: 400,
  height: 400,
};

export const VHARN_MAP: AssetDto = {
  id: '6c5d4e3f-2a1b-4c0d-9e8f-7a6b5c4d3e2f',
  mimeType: 'image/webp',
  width: 1400,
  height: 700,
};

export type SentAsset =
  | Readonly<{ kind: 'upload'; campaignId: string; file: Blob; purpose: AssetPurposeDto }>
  | Readonly<{ kind: 'link'; campaignId: string; url: string; purpose: AssetPurposeDto }>;

/** The assets API as the test plays the server: `sent` keeps every upload and link, `answerWith`
 *  sets the next answer (Lyra's portrait by default) and `hold()` keeps the next one pending
 *  until `release()`; `outlines` plays the silhouettes of the images.
 *
 *  Example: `deps.assets.answerWith({ ok: false, failure: { kind: 'link_blocked' } })` */
export class AssetsApiFake implements RoomAssetsApi {
  readonly sent: SentAsset[] = [];
  readonly outlines = new AssetOutlineApiFake();
  private answer: AssetsResult = { ok: true, asset: LYRA_PORTRAIT };
  private held: (() => void) | null = null;
  private holdNext = false;

  answerWith(result: AssetsResult): void {
    this.answer = result;
  }

  hold(): void {
    this.holdNext = true;
  }

  release(): void {
    this.held?.();
    this.held = null;
  }

  upload(campaignId: string, file: Blob, purpose: AssetPurposeDto): Promise<AssetsResult> {
    return this.record({ kind: 'upload', campaignId, file, purpose });
  }

  importLink(campaignId: string, url: string, purpose: AssetPurposeDto): Promise<AssetsResult> {
    return this.record({ kind: 'link', campaignId, url, purpose });
  }

  outlineOf(assetId: string): Promise<AssetOutlineResult> {
    return this.outlines.outlineOf(assetId);
  }

  private record(sent: SentAsset): Promise<AssetsResult> {
    this.sent.push(sent);
    const answer = this.answer;
    if (!this.holdNext) return Promise.resolve(answer);
    this.holdNext = false;
    return new Promise((resolve) => {
      this.held = () => resolve(answer);
    });
  }
}
