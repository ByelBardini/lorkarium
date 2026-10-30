import { imagePresentationStateDto, type ImagePresentationStateDto } from '@lorkarium/contracts';
import { callApi, parseOk } from './api-call';
import type { HttpTransport } from './http-transport';
import type { LibraryResult } from './library-api';

/** Authoritative presentation commands and recovery. Example: `api.snapshot(campaignId)`. */
export interface ImagePresentationApi {
  snapshot(campaignId: string): Promise<LibraryResult<ImagePresentationStateDto>>;
  present(campaignId: string, imageId: string): Promise<LibraryResult<ImagePresentationStateDto>>;
}

/** HTTP presentations, without automatic command retries. Example: `new HttpImagePresentationApi(http)`. */
export class HttpImagePresentationApi implements ImagePresentationApi {
  constructor(private readonly transport: HttpTransport) {}

  snapshot(campaignId: string): Promise<LibraryResult<ImagePresentationStateDto>> {
    return this.request('GET', `/campaigns/${encodeURIComponent(campaignId)}/image-presentation`);
  }

  present(campaignId: string, imageId: string): Promise<LibraryResult<ImagePresentationStateDto>> {
    const path = `/campaigns/${encodeURIComponent(campaignId)}/library-images/${encodeURIComponent(imageId)}/presentations`;
    return this.request('POST', path);
  }

  private async request(
    method: 'GET' | 'POST',
    path: string,
  ): Promise<LibraryResult<ImagePresentationStateDto>> {
    const call = await callApi(this.transport, method, path);
    if (call.kind === 'offline') return { ok: false, failure: { kind: 'offline' } };
    if (call.kind === 'ok') return parseOk(imagePresentationStateDto, call.body, (state) => state);
    const statuses = {
      400: 'invalid',
      401: 'unauthenticated',
      403: 'forbidden',
      404: 'not_found',
    } as const;
    const kind = statuses[call.response.status as keyof typeof statuses] ?? 'unexpected';
    return { ok: false, failure: { kind } };
  }
}
