import {
  SHEET_TEMPLATE_ASSETS_MAX_BYTES,
  sheetTemplateAssetMimeTypeDto,
  sheetTemplateAssetResponseDto,
  sheetTemplateResponseDto,
  type CreateSheetTemplateRequestDto,
  type SheetTemplateAssetDto,
  type SheetTemplateAssetMimeTypeDto,
  type SheetTemplateDto,
  type UpdateSheetTemplateRequestDto,
} from '@lorkarium/contracts';
import { callApi, callUpload, errorCodeOf, parseOk, type ApiCall } from './api-call';
import { assetUrlOf } from './assets-api';
import type { HttpMethod, HttpResponse, HttpTransport } from './http-transport';
import { fetchAssetBytes, type AssetBytesAnswer, type AssetBytesReader } from './sheets-api';

export type SheetTemplatesFailure = Readonly<{
  kind:
    | 'conflict'
    | 'in_use'
    | 'folder_not_found'
    | 'forbidden'
    | 'not_found'
    | 'unauthenticated'
    | 'invalid'
    | 'asset_not_found'
    | 'assets_too_large'
    | 'too_large'
    | 'unsupported_asset'
    | 'rate_limited'
    | 'offline'
    | 'unexpected';
}>;

/** The bytes of one template asset, for the frame (an opaque origin sends no cookie). */
export type SheetTemplateAssetData = Readonly<{
  type: SheetTemplateAssetMimeTypeDto;
  bytes: ArrayBuffer;
}>;
export type SheetTemplatesResult<T> =
  Readonly<{ ok: true; value: T }> | Readonly<{ ok: false; failure: SheetTemplatesFailure }>;

/** The master's sheet templates (code included); never throws.
 *
 *  Example: `const result = await api.detail(campaignId, templateId); if (result.ok) result.value.files` */
export interface SheetTemplatesApi {
  detail(campaignId: string, templateId: string): Promise<SheetTemplatesResult<SheetTemplateDto>>;
  create(
    campaignId: string,
    input: CreateSheetTemplateRequestDto,
  ): Promise<SheetTemplatesResult<SheetTemplateDto>>;
  /** Refused with `conflict` when another master saved after `expectedVersion`. */
  update(
    campaignId: string,
    templateId: string,
    input: UpdateSheetTemplateRequestDto,
  ): Promise<SheetTemplatesResult<SheetTemplateDto>>;
  /** Refused with `in_use` while a sheet still runs the template. */
  remove(campaignId: string, templateId: string): Promise<SheetTemplatesResult<null>>;
  /** Sends a font or image for a template (master only); the manifest then names it. */
  uploadAsset(
    campaignId: string,
    bytes: ArrayBuffer,
    type: SheetTemplateAssetMimeTypeDto,
  ): Promise<SheetTemplatesResult<SheetTemplateAssetDto>>;
  /** The bytes of a template asset, for whoever reads a sheet of the template (or the master). */
  asset(assetId: string): Promise<SheetTemplatesResult<SheetTemplateAssetData>>;
}

/** What the frame's host needs to embed a template's assets. */
export type SheetTemplateAssetReader = Pick<SheetTemplatesApi, 'asset'>;

const REFUSAL_BY_CODE: Readonly<Record<string, SheetTemplatesFailure['kind']>> = {
  SHEET_TEMPLATE_VERSION_CONFLICT: 'conflict',
  SHEET_TEMPLATE_IN_USE: 'in_use',
  FOLDER_NOT_FOUND: 'folder_not_found',
  SHEET_TEMPLATE_ASSET_NOT_FOUND: 'asset_not_found',
  SHEET_TEMPLATE_ASSETS_TOO_LARGE: 'assets_too_large',
};
const REFUSAL_BY_STATUS: Readonly<Record<number, SheetTemplatesFailure['kind']>> = {
  400: 'invalid',
  401: 'unauthenticated',
  403: 'forbidden',
  404: 'not_found',
  409: 'conflict',
};
// 415 is a type with no parser and 422 a file that does not decode: the same refusal to the user.
const UPLOAD_REFUSAL_BY_STATUS: Readonly<Record<number, SheetTemplatesFailure['kind']>> = {
  ...REFUSAL_BY_STATUS,
  413: 'too_large',
  415: 'unsupported_asset',
  422: 'unsupported_asset',
  429: 'rate_limited',
};

/** HTTP adapter with contract validation. Example: `new HttpSheetTemplatesApi(transport)` */
export class HttpSheetTemplatesApi implements SheetTemplatesApi {
  constructor(
    private readonly transport: HttpTransport,
    private readonly readBytes: AssetBytesReader = fetchAssetBytes(),
  ) {}

  detail(campaignId: string, templateId: string): Promise<SheetTemplatesResult<SheetTemplateDto>> {
    return this.answer('GET', templatePathOf(campaignId, templateId));
  }
  create(
    campaignId: string,
    input: CreateSheetTemplateRequestDto,
  ): Promise<SheetTemplatesResult<SheetTemplateDto>> {
    return this.answer('POST', templatePathOf(campaignId), input);
  }
  update(
    campaignId: string,
    templateId: string,
    input: UpdateSheetTemplateRequestDto,
  ): Promise<SheetTemplatesResult<SheetTemplateDto>> {
    return this.answer('PATCH', templatePathOf(campaignId, templateId), input);
  }
  async remove(campaignId: string, templateId: string): Promise<SheetTemplatesResult<null>> {
    const call = await callApi(this.transport, 'DELETE', templatePathOf(campaignId, templateId));
    if (call.kind === 'offline') return failed('offline');
    if (call.kind === 'refused') return refused(call.response);
    return { ok: true, value: null };
  }

  async uploadAsset(
    campaignId: string,
    bytes: ArrayBuffer,
    type: SheetTemplateAssetMimeTypeDto,
  ): Promise<SheetTemplatesResult<SheetTemplateAssetDto>> {
    const path = `/campaigns/${encodeURIComponent(campaignId)}/sheet-template-assets`;
    return uploadedOf(await callUpload(this.transport, path, new Blob([bytes], { type })));
  }

  async asset(assetId: string): Promise<SheetTemplatesResult<SheetTemplateAssetData>> {
    let answer: AssetBytesAnswer;
    try {
      answer = await this.readBytes(assetUrlOf(encodeURIComponent(assetId)));
    } catch {
      return failed('offline');
    }
    return assetDataOf(answer);
  }

  private async answer(
    method: HttpMethod,
    path: string,
    body?: unknown,
  ): Promise<SheetTemplatesResult<SheetTemplateDto>> {
    const call = await callApi(this.transport, method, path, body);
    if (call.kind === 'offline') return failed('offline');
    if (call.kind === 'refused') return refused(call.response);
    return parseOk(sheetTemplateResponseDto, call.body, ({ template }) => template);
  }
}

function uploadedOf(call: ApiCall): SheetTemplatesResult<SheetTemplateAssetDto> {
  if (call.kind === 'offline') return failed('offline');
  if (call.kind === 'refused')
    return failed(UPLOAD_REFUSAL_BY_STATUS[call.response.status] ?? 'unexpected');
  return parseOk(sheetTemplateAssetResponseDto, call.body, ({ asset }) => asset);
}

// The type comes from the record (the server's header), and the bytes never pass the budget.
async function assetDataOf(
  answer: AssetBytesAnswer,
): Promise<SheetTemplatesResult<SheetTemplateAssetData>> {
  if (answer.status >= 300) return failed(REFUSAL_BY_STATUS[answer.status] ?? 'unexpected');
  const type = sheetTemplateAssetMimeTypeDto.safeParse(answer.contentType?.split(';')[0]?.trim());
  if (!type.success) return failed('unexpected');
  const bytes = await answer.bytes();
  if (bytes.byteLength > SHEET_TEMPLATE_ASSETS_MAX_BYTES) return failed('unexpected');
  return { ok: true, value: { type: type.data, bytes } };
}

function templatePathOf(campaignId: string, templateId?: string): string {
  const base = `/campaigns/${encodeURIComponent(campaignId)}/sheet-templates`;
  return templateId === undefined ? base : `${base}/${encodeURIComponent(templateId)}`;
}
function failed(kind: SheetTemplatesFailure['kind']): SheetTemplatesResult<never> {
  return { ok: false, failure: { kind } };
}
function refused(response: HttpResponse): SheetTemplatesResult<never> {
  const code = errorCodeOf(response);
  const byCode = code === null ? undefined : REFUSAL_BY_CODE[code];
  return failed(byCode ?? REFUSAL_BY_STATUS[response.status] ?? 'unexpected');
}
