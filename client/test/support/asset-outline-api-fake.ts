import type { SightOutlineDto } from '@lorkarium/contracts';
import type { AssetOutlineApi, AssetOutlineResult, AssetsFailure } from '@/services/assets-api';

/** The silhouettes of the images as the test plays the server: `asked` keeps every asset asked for,
 *  `answer`/`failFor` set an asset's answer (no outline by default) and `hold()` keeps every answer
 *  pending until `release()`.
 *
 *  Example: `deps.assets.outlines.answer(STATUE_ASSET_ID, [[[0.5, 0], [1, 1], [0, 1]]])` */
export class AssetOutlineApiFake implements AssetOutlineApi {
  readonly asked: string[] = [];
  private readonly answers = new Map<string, AssetOutlineResult>();
  private readonly held: (() => void)[] = [];
  private holding = false;

  answer(assetId: string, outline: SightOutlineDto | null): void {
    this.answers.set(assetId, { ok: true, outline });
  }

  failFor(assetId: string, failure: AssetsFailure): void {
    this.answers.set(assetId, { ok: false, failure });
  }

  hold(): void {
    this.holding = true;
  }

  release(): void {
    this.holding = false;
    this.held.splice(0).forEach((resolve) => resolve());
  }

  outlineOf(assetId: string): Promise<AssetOutlineResult> {
    this.asked.push(assetId);
    const answer = this.answers.get(assetId) ?? { ok: true, outline: null };
    if (!this.holding) return Promise.resolve(answer);
    return new Promise((resolve) => {
      this.held.push(() => resolve(answer));
    });
  }
}
