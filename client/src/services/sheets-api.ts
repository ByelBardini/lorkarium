import {
  ASSET_MAX_BYTES,
  assetMimeTypeDto,
  sheetResponseDto,
  sheetWriteResponseDto,
  tokenSheetsResponseDto,
  type AssetMimeTypeDto,
  type CreateSheetRequestDto,
  type DeleteSheetRequestDto,
  type SheetResponseDto,
  type SheetSummaryDto,
  type SheetWriteResponseDto,
  type UpdateSheetRequestDto,
  type UpdateSheetValuesRequestDto,
} from '@lorkarium/contracts';
import type { z } from 'zod';
import { callApi, errorCodeOf, parseOk } from './api-call';
import { assetUrlOf } from './assets-api';
import type { HttpMethod, HttpResponse, HttpTransport } from './http-transport';

export type SheetsFailure = Readonly<{
  kind:
    | 'action_reused'
    | 'member_not_found'
    | 'forbidden'
    | 'not_found'
    | 'unauthenticated'
    | 'invalid'
    | 'offline'
    | 'unexpected';
}>;
export type SheetsResult<T> =
  Readonly<{ ok: true; value: T }> | Readonly<{ ok: false; failure: SheetsFailure }>;

/** The token image as the frame takes it: bytes, since the cookie never leaves an opaque origin. */
export type SheetImage = Readonly<{ type: AssetMimeTypeDto; bytes: ArrayBuffer }>;

/** One answer of the asset route, read as bytes. */
export type AssetBytesAnswer = Readonly<{
  status: number;
  contentType: string | null;
  bytes: () => Promise<ArrayBuffer>;
}>;
/** Reads one same-origin URL as bytes, with the session cookie; throws when offline. */
export type AssetBytesReader = (url: string) => Promise<AssetBytesAnswer>;

/** Authorized sheet commands and reads; never throws.
 *
 *  Example: `const result = await api.detail(campaignId, sheetId); if (result.ok) result.value.template.name` */
export interface SheetsApi {
  detail(campaignId: string, sheetId: string): Promise<SheetsResult<SheetResponseDto>>;
  /** The sheets of a token this reader may read (the anchor's, for a linked token), in order of
   *  creation; a token of another table is `not_found`. */
  ofToken(campaignId: string, tokenId: string): Promise<SheetsResult<readonly SheetSummaryDto[]>>;
  create(
    campaignId: string,
    input: CreateSheetRequestDto,
  ): Promise<SheetsResult<SheetWriteResponseDto>>;
  /** Per-key patch: the last write wins per key, `null` removes a key. */
  saveValues(
    campaignId: string,
    sheetId: string,
    input: UpdateSheetValuesRequestDto,
  ): Promise<SheetsResult<SheetWriteResponseDto>>;
  update(
    campaignId: string,
    sheetId: string,
    input: UpdateSheetRequestDto,
  ): Promise<SheetsResult<SheetWriteResponseDto>>;
  remove(
    campaignId: string,
    sheetId: string,
    input: DeleteSheetRequestDto,
  ): Promise<SheetsResult<null>>;
  /** The bytes of a table image (the token's), for the frame. */
  image(assetId: string): Promise<SheetsResult<SheetImage>>;
}

const REFUSAL_BY_CODE: Readonly<Record<string, SheetsFailure['kind']>> = {
  SHEET_ACTION_REUSED: 'action_reused',
  MEMBER_NOT_FOUND: 'member_not_found',
};
const REFUSAL_BY_STATUS: Readonly<Record<number, SheetsFailure['kind']>> = {
  400: 'invalid',
  401: 'unauthenticated',
  403: 'forbidden',
  404: 'not_found',
};

/** `AssetBytesReader` over `fetch`. Example: `new HttpSheetsApi(transport, fetchAssetBytes())` */
export function fetchAssetBytes(
  fetchImpl: typeof fetch = (...args) => fetch(...args),
): AssetBytesReader {
  return async (url) => {
    const response = await fetchImpl(url, { credentials: 'same-origin' });
    return {
      status: response.status,
      contentType: response.headers.get('content-type'),
      bytes: () => response.arrayBuffer(),
    };
  };
}

/** HTTP adapter with contract validation. Example: `new HttpSheetsApi(transport, fetchAssetBytes())` */
export class HttpSheetsApi implements SheetsApi {
  constructor(
    private readonly transport: HttpTransport,
    private readonly readBytes: AssetBytesReader,
  ) {}

  detail(campaignId: string, sheetId: string): Promise<SheetsResult<SheetResponseDto>> {
    return this.answer('GET', sheetPathOf(campaignId, sheetId), sheetResponseDto);
  }
  async ofToken(
    campaignId: string,
    tokenId: string,
  ): Promise<SheetsResult<readonly SheetSummaryDto[]>> {
    const path = `${campaignPathOf(campaignId)}/tokens/${encodeURIComponent(tokenId)}/sheets`;
    const result = await this.answer('GET', path, tokenSheetsResponseDto);
    return result.ok ? { ok: true, value: result.value.sheets } : result;
  }
  create(
    campaignId: string,
    input: CreateSheetRequestDto,
  ): Promise<SheetsResult<SheetWriteResponseDto>> {
    return this.answer('POST', sheetPathOf(campaignId), sheetWriteResponseDto, input);
  }
  saveValues(
    campaignId: string,
    sheetId: string,
    input: UpdateSheetValuesRequestDto,
  ): Promise<SheetsResult<SheetWriteResponseDto>> {
    const path = `${sheetPathOf(campaignId, sheetId)}/values`;
    return this.answer('PATCH', path, sheetWriteResponseDto, input);
  }
  update(
    campaignId: string,
    sheetId: string,
    input: UpdateSheetRequestDto,
  ): Promise<SheetsResult<SheetWriteResponseDto>> {
    return this.answer('PATCH', sheetPathOf(campaignId, sheetId), sheetWriteResponseDto, input);
  }
  async remove(
    campaignId: string,
    sheetId: string,
    input: DeleteSheetRequestDto,
  ): Promise<SheetsResult<null>> {
    const call = await callApi(this.transport, 'DELETE', sheetPathOf(campaignId, sheetId), input);
    if (call.kind === 'offline') return failed('offline');
    if (call.kind === 'refused') return refused(call.response);
    return { ok: true, value: null };
  }
  async image(assetId: string): Promise<SheetsResult<SheetImage>> {
    let answer: AssetBytesAnswer;
    try {
      answer = await this.readBytes(assetUrlOf(encodeURIComponent(assetId)));
    } catch {
      return failed('offline');
    }
    return imageOf(answer);
  }

  private async answer<S extends z.ZodType>(
    method: HttpMethod,
    path: string,
    dto: S,
    body?: unknown,
  ): Promise<SheetsResult<z.infer<S>>> {
    const call = await callApi(this.transport, method, path, body);
    if (call.kind === 'offline') return failed('offline');
    if (call.kind === 'refused') return refused(call.response);
    return parseOk(dto, call.body, (parsed) => parsed);
  }
}

async function imageOf(answer: AssetBytesAnswer): Promise<SheetsResult<SheetImage>> {
  if (answer.status >= 300) return failed(REFUSAL_BY_STATUS[answer.status] ?? 'unexpected');
  const type = assetMimeTypeDto.safeParse(answer.contentType?.split(';')[0]?.trim());
  if (!type.success) return failed('unexpected');
  const bytes = await answer.bytes();
  if (bytes.byteLength > ASSET_MAX_BYTES) return failed('unexpected');
  return { ok: true, value: { type: type.data, bytes } };
}

function campaignPathOf(campaignId: string): string {
  return `/campaigns/${encodeURIComponent(campaignId)}`;
}
function sheetPathOf(campaignId: string, sheetId?: string): string {
  const base = `${campaignPathOf(campaignId)}/sheets`;
  return sheetId === undefined ? base : `${base}/${encodeURIComponent(sheetId)}`;
}
function failed(kind: SheetsFailure['kind']): SheetsResult<never> {
  return { ok: false, failure: { kind } };
}
function refused(response: HttpResponse): SheetsResult<never> {
  const code = errorCodeOf(response);
  const byCode = code === null ? undefined : REFUSAL_BY_CODE[code];
  return failed(byCode ?? REFUSAL_BY_STATUS[response.status] ?? 'unexpected');
}
