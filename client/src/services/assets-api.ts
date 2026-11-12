import {
  assetOutlineResponseDto,
  assetResponseDto,
  type AssetDto,
  type AssetPurposeDto,
  type SightOutlineDto,
} from '@lorkarium/contracts';
import {
  callApi,
  callUpload,
  errorCodeOf,
  parseOk,
  planLimitFailureOf,
  retryAfterOf,
  type ApiCall,
  type PlanLimitFailure,
} from './api-call';
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
  | Readonly<{ kind: 'unexpected' }>
  /** The table owner's plan ran out (storage): 403 `PLAN_LIMIT`. */
  | PlanLimitFailure;

export type AssetsFailureKind = AssetsFailure['kind'];

export type AssetsResult =
  Readonly<{ ok: true; asset: AssetDto }> | Readonly<{ ok: false; failure: AssetsFailure }>;

export type AssetOutlineResult =
  | Readonly<{ ok: true; outline: SightOutlineDto | null }>
  | Readonly<{ ok: false; failure: AssetsFailure }>;

/** The part of the image (upright, after the EXIF orientation) to keep, in percent (0..100) of
 *  its width and height: the server cuts it in the proportion of the purpose's format. */
export type ImageCropRect = Readonly<{ x: number; y: number; width: number; height: number }>;

/** The silhouette of an image, as the sight of a blocking token reads it. Never throws. */
export interface AssetOutlineApi {
  outlineOf(assetId: string): Promise<AssetOutlineResult>;
}

/** Sending images to a table: the file itself or a link the server downloads. Never throws. */
export interface AssetsApi {
  upload(
    campaignId: string,
    file: Blob,
    purpose: AssetPurposeDto,
    crop?: ImageCropRect,
  ): Promise<AssetsResult>;
  importLink(campaignId: string, url: string, purpose: AssetPurposeDto): Promise<AssetsResult>;
}

/** What the room does with images: sends them and reads their silhouettes. */
export interface RoomAssetsApi extends AssetsApi, AssetOutlineApi {}

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
 *  Example: `await new HttpAssetsApi(transport).upload(campaignId, file, 'campaign_photo', crop)` */
export class HttpAssetsApi implements RoomAssetsApi {
  constructor(private readonly transport: HttpTransport) {}

  async upload(
    campaignId: string,
    file: Blob,
    purpose: AssetPurposeDto,
    crop?: ImageCropRect,
  ): Promise<AssetsResult> {
    const query = uploadQueryOf(purpose, crop);
    const path = `/campaigns/${encodeURIComponent(campaignId)}/assets?${query}`;
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

  async outlineOf(assetId: string): Promise<AssetOutlineResult> {
    const path = `/assets/${encodeURIComponent(assetId)}/outline`;
    const call = await callApi(this.transport, 'GET', path);
    if (call.kind === 'offline') return { ok: false, failure: { kind: 'offline' } };
    if (call.kind === 'refused') return { ok: false, failure: failureOf(call.response) };
    const parsed = parseOk(assetOutlineResponseDto, call.body, (body) => body.outline);
    return parsed.ok ? { ok: true, outline: parsed.value } : parsed;
  }
}

// The names of `uploadAssetQueryDto`: all four or none.
function uploadQueryOf(purpose: AssetPurposeDto, crop: ImageCropRect | undefined): string {
  const query = new URLSearchParams({ purpose });
  if (!crop) return query.toString();
  query.set('cropX', String(crop.x));
  query.set('cropY', String(crop.y));
  query.set('cropW', String(crop.width));
  query.set('cropH', String(crop.height));
  return query.toString();
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
  const planLimit = planLimitFailureOf(response);
  if (planLimit) return planLimit;
  const byCode = FAILURE_BY_CODE[errorCodeOf(response) ?? ''];
  return byCode ?? FAILURE_BY_STATUS[response.status] ?? { kind: 'unexpected' };
}
