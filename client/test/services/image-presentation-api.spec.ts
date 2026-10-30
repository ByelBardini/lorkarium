import { describe, expect, it } from 'vitest';
import { HttpImagePresentationApi } from '@/services/image-presentation-api';
import { HttpTransportFake } from '../support/http-transport-fake';
import { imagePresentation, IMAGE_ID } from '../support/image-presentation-fixtures';

describe('HttpImagePresentationApi', () => {
  it('recovers the current version through the authorized snapshot endpoint', async () => {
    const http = new HttpTransportFake().respondWith(200, imagePresentation());
    const result = await new HttpImagePresentationApi(http).snapshot(
      imagePresentation().campaignId,
    );
    expect(result.ok && result.value.presentation?.name).toBe('Retrato');
    expect(http.requests[0]?.path).toBe(
      `/campaigns/${imagePresentation().campaignId}/image-presentation`,
    );
  });
  it('a timed out presentation stays offline and is never automatically posted twice', async () => {
    const http = new HttpTransportFake().failWithNetworkDown();
    expect(
      await new HttpImagePresentationApi(http).present(imagePresentation().campaignId, IMAGE_ID),
    ).toEqual({ ok: false, failure: { kind: 'offline' } });
    expect(http.requests).toEqual([
      {
        method: 'POST',
        path: `/campaigns/${imagePresentation().campaignId}/library-images/${IMAGE_ID}/presentations`,
        body: undefined,
      },
    ]);
  });
  it('a malformed snapshot is refused instead of reaching the store', async () => {
    const http = new HttpTransportFake().respondWith(200, { ...imagePresentation(), version: -1 });
    expect(
      await new HttpImagePresentationApi(http).snapshot(imagePresentation().campaignId),
    ).toEqual({ ok: false, failure: { kind: 'unexpected' } });
  });
});
