import {
  sheetTemplateResponseDto,
  type CreateSheetTemplateRequestDto,
  type SheetTemplateDto,
  type UpdateSheetTemplateRequestDto,
} from '@lorkarium/contracts';
import { callApi, errorCodeOf, parseOk } from './api-call';
import type { HttpMethod, HttpResponse, HttpTransport } from './http-transport';

export type SheetTemplatesFailure = Readonly<{
  kind:
    | 'conflict'
    | 'in_use'
    | 'folder_not_found'
    | 'forbidden'
    | 'not_found'
    | 'unauthenticated'
    | 'invalid'
    | 'offline'
    | 'unexpected';
}>;
export type SheetTemplatesResult<T> =
  Readonly<{ ok: true; value: T }> | Readonly<{ ok: false; failure: SheetTemplatesFailure }>;

/** The master's sheet templates (code included); never throws.
 *
 *  Example: `const result = await api.detail(campaignId, templateId); if (result.ok) result.value.js` */
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
}

const REFUSAL_BY_CODE: Readonly<Record<string, SheetTemplatesFailure['kind']>> = {
  SHEET_TEMPLATE_VERSION_CONFLICT: 'conflict',
  SHEET_TEMPLATE_IN_USE: 'in_use',
  FOLDER_NOT_FOUND: 'folder_not_found',
};
const REFUSAL_BY_STATUS: Readonly<Record<number, SheetTemplatesFailure['kind']>> = {
  400: 'invalid',
  401: 'unauthenticated',
  403: 'forbidden',
  404: 'not_found',
  409: 'conflict',
};

/** HTTP adapter with contract validation. Example: `new HttpSheetTemplatesApi(transport)` */
export class HttpSheetTemplatesApi implements SheetTemplatesApi {
  constructor(private readonly transport: HttpTransport) {}

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
