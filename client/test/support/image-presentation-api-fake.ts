import type { ImagePresentationStateDto } from '@lorkarium/contracts';
import type { ImagePresentationApi } from '@/services/image-presentation-api';
import type { LibraryResult } from '@/services/library-api';

/** Controlled presentation recovery and commands. Example: `fake.answer = { ok: false, failure: { kind: 'offline' } }`. */
export class ImagePresentationApiFake implements ImagePresentationApi {
  readonly calls: Array<
    Readonly<{ method: 'snapshot' | 'present'; campaignId: string; imageId?: string }>
  > = [];
  answer: LibraryResult<ImagePresentationStateDto> | null = null;

  async snapshot(campaignId: string): Promise<LibraryResult<ImagePresentationStateDto>> {
    this.calls.push({ method: 'snapshot', campaignId });
    return (
      this.answer ?? {
        ok: true,
        value: { campaignId, version: 0, at: '2026-10-29T12:00:00.000Z', presentation: null },
      }
    );
  }

  async present(
    campaignId: string,
    imageId: string,
  ): Promise<LibraryResult<ImagePresentationStateDto>> {
    this.calls.push({ method: 'present', campaignId, imageId });
    return this.answer ?? { ok: false, failure: { kind: 'unexpected' } };
  }
}
