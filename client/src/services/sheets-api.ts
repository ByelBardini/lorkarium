import {
  ASSET_MAX_BYTES,
  apiErrorDto,
  assetMimeTypeDto,
  assetResponseDto,
  createSheetBarResponseDto,
  type ApiErrorDto,
  type CreateSheetBarRequestInput,
  type CreateSheetBarResponseDto,
  sheetResponseDto,
  sheetWriteResponseDto,
  tokenSheetsResponseDto,
  type AssetDto,
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
import { callApi, callUpload, errorCodeOf, parseOk, type ApiCall } from './api-call';
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
    | 'too_large'
    | 'unsupported_image'
    | 'rate_limited'
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
  /** The sheets of a character this reader may read (`GET …/characters/:id/sheets`). */
  ofCharacter(
    campaignId: string,
    characterId: string,
  ): Promise<SheetsResult<readonly SheetSummaryDto[]>>;
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
  /** Sends an image to the sheet (`POST …/sheets/:id/images`): who reads the sheet reads it. */
  uploadImage(
    campaignId: string,
    sheetId: string,
    bytes: ArrayBuffer,
    type: AssetMimeTypeDto,
  ): Promise<SheetsResult<AssetDto>>;
  /** Creates on the sheet's holder a bar it lacks (`POST …/sheets/:id/bars`); one already there
   *  under that label answers its id with `created: false`. */
  createBar(
    campaignId: string,
    sheetId: string,
    input: CreateSheetBarRequestInput,
  ): Promise<SheetBarCreationResult>;
}

/** `createBar`'s answer: a refusal keeps the server's code and text (`BAR_LIMIT` cites the bar
 *  and the cap), for the sheet to show. */
export type SheetBarCreationResult =
  | Readonly<{ ok: true; value: CreateSheetBarResponseDto }>
  | Readonly<{ ok: false; failure: SheetsFailure; refusal: ApiErrorDto | null }>;

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
// 415 is a type with no parser and 422 a file that does not decode: the same refusal to the user.
const UPLOAD_REFUSAL_BY_STATUS: Readonly<Record<number, SheetsFailure['kind']>> = {
  ...REFUSAL_BY_STATUS,
  413: 'too_large',
  415: 'unsupported_image',
  422: 'unsupported_image',
  429: 'rate_limited',
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
  ofToken(campaignId: string, tokenId: string): Promise<SheetsResult<readonly SheetSummaryDto[]>> {
    return this.sheetsAt(
      `${campaignPathOf(campaignId)}/tokens/${encodeURIComponent(tokenId)}/sheets`,
    );
  }
  ofCharacter(
    campaignId: string,
    characterId: string,
  ): Promise<SheetsResult<readonly SheetSummaryDto[]>> {
    const id = encodeURIComponent(characterId);
    return this.sheetsAt(`${campaignPathOf(campaignId)}/characters/${id}/sheets`);
  }
  // A token's and a character's answer have the same shape.
  private async sheetsAt(path: string): Promise<SheetsResult<readonly SheetSummaryDto[]>> {
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

  async uploadImage(
    campaignId: string,
    sheetId: string,
    bytes: ArrayBuffer,
    type: AssetMimeTypeDto,
  ): Promise<SheetsResult<AssetDto>> {
    const path = `${sheetPathOf(campaignId, sheetId)}/images`;
    return uploadedOf(await callUpload(this.transport, path, new Blob([bytes], { type })));
  }

  async createBar(
    campaignId: string,
    sheetId: string,
    input: CreateSheetBarRequestInput,
  ): Promise<SheetBarCreationResult> {
    const path = `${sheetPathOf(campaignId, sheetId)}/bars`;
    const call = await callApi(this.transport, 'POST', path, input);
    if (call.kind === 'offline') return { ok: false, failure: { kind: 'offline' }, refusal: null };
    if (call.kind === 'refused') return barRefusalOf(call.response);
    const parsed = parseOk(createSheetBarResponseDto, call.body, (body) => body);
    return parsed.ok ? parsed : { ...parsed, refusal: null };
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

function barRefusalOf(response: HttpResponse): SheetBarCreationResult {
  const body = apiErrorDto.safeParse(response.body);
  const result = refused(response);
  const failure: SheetsFailure = result.ok ? { kind: 'unexpected' } : result.failure;
  return { ok: false, failure, refusal: body.success ? body.data : null };
}

function uploadedOf(call: ApiCall): SheetsResult<AssetDto> {
  if (call.kind === 'offline') return failed('offline');
  if (call.kind === 'refused')
    return failed(UPLOAD_REFUSAL_BY_STATUS[call.response.status] ?? 'unexpected');
  return parseOk(assetResponseDto, call.body, (parsed) => parsed.asset);
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
