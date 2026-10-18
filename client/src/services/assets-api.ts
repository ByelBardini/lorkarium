import { assetResponseDto, type AssetDto, type AssetPurposeDto } from '@lorkarium/contracts';
import { callApi, callUpload, errorCodeOf, parseOk, retryAfterOf, type ApiCall } from './api-call';
import type { HttpResponse, HttpTransport } from './http-transport';

export type AssetsFailure =
  | Readonly<{ kind: 'unauthenticated' }>
  | Readonly<{ kind: 'not_found' }>
  | Readonly<{ kind: 'invalid' }>
  | Readonly<{ kind: 'too_large' }>
  | Readonly<{ kind: 'unsupported' }>
  | Readonly<{ kind: 'link_blocked' }>
  | Readonly<{ kind: 'link_not_image' }>
  | Readonly<{ kind: 'link_unreachable' }>
  | Readonly<{ kind: 'rate_limited'; retryAfterSeconds: number }>
  | Readonly<{ kind: 'offline' }>
  | Readonly<{ kind: 'unexpected' }>;

export type AssetsFailureKind = AssetsFailure['kind'];

export type AssetsResult =
  Readonly<{ ok: true; asset: AssetDto }> | Readonly<{ ok: false; failure: AssetsFailure }>;

/** Sending images to a table: the file itself or a link the server downloads. Never throws. */
export interface AssetsApi {
  upload(campaignId: string, file: Blob, purpose: AssetPurposeDto): Promise<AssetsResult>;
  importLink(campaignId: string, url: string, purpose: AssetPurposeDto): Promise<AssetsResult>;
}

const FAILURE_BY_STATUS: Readonly<Record<number, AssetsFailure>> = {
  400: { kind: 'invalid' },
  401: { kind: 'unauthenticated' },
  404: { kind: 'not_found' },
  413: { kind: 'too_large' },
  415: { kind: 'unsupported' },
};

const FAILURE_BY_CODE: Readonly<Record<string, AssetsFailure>> = {
  UNSUPPORTED_IMAGE: { kind: 'unsupported' },
  LINK_BLOCKED: { kind: 'link_blocked' },
  LINK_NOT_IMAGE: { kind: 'link_not_image' },
  LINK_UNREACHABLE: { kind: 'link_unreachable' },
};

/** Where the browser reads an asset: the same origin, so WebGL takes it without CORS.
 *
 *  Example: `assetUrlOf(scene.background.assetId) // '/api/assets/<id>'` */
export function assetUrlOf(assetId: string): string {
  return `/api/assets/${assetId}`;
}

/** `AssetsApi` over HTTP: validates every answer by the contracts DTO.
 *
 *  Example: `const result = await new HttpAssetsApi(transport).upload(campaignId, file, 'token')` */
export class HttpAssetsApi implements AssetsApi {
  constructor(private readonly transport: HttpTransport) {}

  async upload(campaignId: string, file: Blob, purpose: AssetPurposeDto): Promise<AssetsResult> {
    const path = `/campaigns/${encodeURIComponent(campaignId)}/assets?purpose=${purpose}`;
    return answerOf(await callUpload(this.transport, path, file));
  }

  async importLink(
    campaignId: string,
    url: string,
    purpose: AssetPurposeDto,
  ): Promise<AssetsResult> {
    const path = `/campaigns/${encodeURIComponent(campaignId)}/assets/import`;
    return answerOf(await callApi(this.transport, 'POST', path, { url, purpose }));
  }
}

function answerOf(call: ApiCall): AssetsResult {
  if (call.kind === 'offline') return { ok: false, failure: { kind: 'offline' } };
  if (call.kind === 'refused') return { ok: false, failure: failureOf(call.response) };
  const parsed = parseOk(assetResponseDto, call.body, (body) => body.asset);
  return parsed.ok ? { ok: true, asset: parsed.value } : parsed;
}

function failureOf(response: HttpResponse): AssetsFailure {
  if (response.status === 429) {
    return { kind: 'rate_limited', retryAfterSeconds: retryAfterOf(response) };
  }
  const byCode = FAILURE_BY_CODE[errorCodeOf(response) ?? ''];
  return byCode ?? FAILURE_BY_STATUS[response.status] ?? { kind: 'unexpected' };
}
