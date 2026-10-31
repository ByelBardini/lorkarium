import {
  assetResponseDto,
  documentResponseDto,
  documentTabResponseDto,
  documentTabWriteResponseDto,
  documentWriteResponseDto,
  type AssetDto,
  type CreateDocumentTabRequestDto,
  type DeleteDocumentTabRequestDto,
  type DocumentDto,
  type DocumentTabDto,
  type DocumentTabWriteResponseDto,
  type DocumentWriteResponseDto,
  type CreateDocumentRequestDto,
  type ReorderDocumentTabsRequestDto,
  type UpdateDocumentContentRequestDto,
  type UpdateDocumentRequestDto,
  type UpdateDocumentTabContentRequestDto,
  type UpdateDocumentTabRequestDto,
  type DeleteDocumentRequestDto,
} from '@lorkarium/contracts';
import type { z } from 'zod';
import { callApi, errorCodeOf, parseOk } from './api-call';
import {
  NetworkUnavailableError,
  type HttpTransport,
  type HttpMethod,
  type HttpResponse,
} from './http-transport';

export type DocumentsFailure = Readonly<{
  kind:
    | 'conflict'
    | 'action_reused'
    | 'forbidden'
    | 'not_found'
    | 'unauthenticated'
    | 'invalid'
    | 'tab_limit'
    | 'last_tab'
    | 'offline'
    | 'unexpected';
}>;
export type DocumentsResult<T> =
  Readonly<{ ok: true; value: T }> | Readonly<{ ok: false; failure: DocumentsFailure }>;

/** Authorized document commands. Example: `await api.detail(campaignId, documentId)`. */
export interface DocumentsApi {
  detail(campaignId: string, documentId: string): Promise<DocumentsResult<DocumentDto>>;
  create(
    campaignId: string,
    input: CreateDocumentRequestDto,
  ): Promise<DocumentsResult<DocumentWriteResponseDto>>;
  save(
    campaignId: string,
    documentId: string,
    input: UpdateDocumentContentRequestDto,
  ): Promise<DocumentsResult<DocumentWriteResponseDto>>;
  update(
    campaignId: string,
    documentId: string,
    input: UpdateDocumentRequestDto,
  ): Promise<DocumentsResult<DocumentWriteResponseDto>>;
  remove(
    campaignId: string,
    documentId: string,
    input: DeleteDocumentRequestDto,
  ): Promise<DocumentsResult<null>>;
  /** Images are prepared in the tab they go in; a tab the author may not see answers `not_found`. */
  uploadImage(
    campaignId: string,
    documentId: string,
    tabId: string,
    file: Blob,
  ): Promise<DocumentsResult<AssetDto>>;
  importImage(
    campaignId: string,
    documentId: string,
    tabId: string,
    url: string,
  ): Promise<DocumentsResult<AssetDto>>;
  libraryImage(
    campaignId: string,
    documentId: string,
    tabId: string,
    imageId: string,
  ): Promise<DocumentsResult<AssetDto>>;
  /** One tab's body; a tab the reader may not see answers `not_found`. */
  tab(
    campaignId: string,
    documentId: string,
    tabId: string,
  ): Promise<DocumentsResult<DocumentTabDto>>;
  /** Saves one tab's body against the tab's own version. */
  saveTab(
    campaignId: string,
    documentId: string,
    tabId: string,
    input: UpdateDocumentTabContentRequestDto,
  ): Promise<DocumentsResult<DocumentTabWriteResponseDto>>;
  /** The new tab's id comes in `receipt.tabId`. */
  createTab(
    campaignId: string,
    documentId: string,
    input: CreateDocumentTabRequestDto,
  ): Promise<DocumentsResult<DocumentWriteResponseDto>>;
  updateTab(
    campaignId: string,
    documentId: string,
    tabId: string,
    input: UpdateDocumentTabRequestDto,
  ): Promise<DocumentsResult<DocumentWriteResponseDto>>;
  reorderTabs(
    campaignId: string,
    documentId: string,
    input: ReorderDocumentTabsRequestDto,
  ): Promise<DocumentsResult<DocumentWriteResponseDto>>;
  removeTab(
    campaignId: string,
    documentId: string,
    tabId: string,
    input: DeleteDocumentTabRequestDto,
  ): Promise<DocumentsResult<DocumentWriteResponseDto>>;
}

/** HTTP adapter with contract validation. Example: `new HttpDocumentsApi(transport)`. */
export class HttpDocumentsApi implements DocumentsApi {
  constructor(private readonly transport: HttpTransport) {}
  async detail(campaignId: string, documentId: string): Promise<DocumentsResult<DocumentDto>> {
    const result = await this.answer('GET', pathOf(campaignId, documentId), documentResponseDto);
    return result.ok ? { ok: true, value: result.value.document } : result;
  }
  create(
    campaignId: string,
    input: CreateDocumentRequestDto,
  ): Promise<DocumentsResult<DocumentWriteResponseDto>> {
    return this.answer('POST', pathOf(campaignId), documentWriteResponseDto, input);
  }
  save(
    campaignId: string,
    documentId: string,
    input: UpdateDocumentContentRequestDto,
  ): Promise<DocumentsResult<DocumentWriteResponseDto>> {
    return this.answer(
      'PATCH',
      `${pathOf(campaignId, documentId)}/content`,
      documentWriteResponseDto,
      input,
    );
  }
  update(
    campaignId: string,
    documentId: string,
    input: UpdateDocumentRequestDto,
  ): Promise<DocumentsResult<DocumentWriteResponseDto>> {
    return this.answer('PATCH', pathOf(campaignId, documentId), documentWriteResponseDto, input);
  }
  async remove(
    campaignId: string,
    documentId: string,
    input: DeleteDocumentRequestDto,
  ): Promise<DocumentsResult<null>> {
    const call = await callApi(this.transport, 'DELETE', pathOf(campaignId, documentId), input);
    return call.kind === 'ok'
      ? { ok: true, value: null }
      : call.kind === 'offline'
        ? offline()
        : refused(call.response);
  }
  async uploadImage(
    campaignId: string,
    documentId: string,
    tabId: string,
    file: Blob,
  ): Promise<DocumentsResult<AssetDto>> {
    try {
      const response = await this.transport.upload(
        `${tabPathOf(campaignId, documentId, tabId)}/images`,
        file,
      );
      return response.status < 300
        ? parseOk(assetResponseDto, response.body, (parsed) => parsed.asset)
        : refused(response);
    } catch (error) {
      if (error instanceof NetworkUnavailableError) return offline();
      throw error;
    }
  }
  async importImage(
    campaignId: string,
    documentId: string,
    tabId: string,
    url: string,
  ): Promise<DocumentsResult<AssetDto>> {
    const result = await this.answer(
      'POST',
      `${tabPathOf(campaignId, documentId, tabId)}/images/import`,
      assetResponseDto,
      { url },
    );
    return result.ok ? { ok: true, value: result.value.asset } : result;
  }
  async libraryImage(
    campaignId: string,
    documentId: string,
    tabId: string,
    imageId: string,
  ): Promise<DocumentsResult<AssetDto>> {
    const result = await this.answer(
      'POST',
      `${tabPathOf(campaignId, documentId, tabId)}/images/from-library`,
      assetResponseDto,
      { imageId },
    );
    return result.ok ? { ok: true, value: result.value.asset } : result;
  }
  async tab(
    campaignId: string,
    documentId: string,
    tabId: string,
  ): Promise<DocumentsResult<DocumentTabDto>> {
    const path = tabPathOf(campaignId, documentId, tabId);
    const result = await this.answer('GET', path, documentTabResponseDto);
    return result.ok ? { ok: true, value: result.value.tab } : result;
  }
  saveTab(
    campaignId: string,
    documentId: string,
    tabId: string,
    input: UpdateDocumentTabContentRequestDto,
  ): Promise<DocumentsResult<DocumentTabWriteResponseDto>> {
    const path = `${tabPathOf(campaignId, documentId, tabId)}/content`;
    return this.answer('PATCH', path, documentTabWriteResponseDto, input);
  }
  createTab(
    campaignId: string,
    documentId: string,
    input: CreateDocumentTabRequestDto,
  ): Promise<DocumentsResult<DocumentWriteResponseDto>> {
    return this.answer('POST', tabPathOf(campaignId, documentId), documentWriteResponseDto, input);
  }
  updateTab(
    campaignId: string,
    documentId: string,
    tabId: string,
    input: UpdateDocumentTabRequestDto,
  ): Promise<DocumentsResult<DocumentWriteResponseDto>> {
    const path = tabPathOf(campaignId, documentId, tabId);
    return this.answer('PATCH', path, documentWriteResponseDto, input);
  }
  reorderTabs(
    campaignId: string,
    documentId: string,
    input: ReorderDocumentTabsRequestDto,
  ): Promise<DocumentsResult<DocumentWriteResponseDto>> {
    const path = `${tabPathOf(campaignId, documentId)}/order`;
    return this.answer('PATCH', path, documentWriteResponseDto, input);
  }
  removeTab(
    campaignId: string,
    documentId: string,
    tabId: string,
    input: DeleteDocumentTabRequestDto,
  ): Promise<DocumentsResult<DocumentWriteResponseDto>> {
    const path = tabPathOf(campaignId, documentId, tabId);
    return this.answer('DELETE', path, documentWriteResponseDto, input);
  }
  private async answer<S extends z.ZodType>(
    method: HttpMethod,
    path: string,
    dto: S,
    body?: unknown,
  ): Promise<DocumentsResult<z.infer<S>>> {
    const call = await callApi(this.transport, method, path, body);
    if (call.kind === 'offline') return offline();
    if (call.kind === 'refused') return refused(call.response);
    return parseOk(dto, call.body, (parsed) => parsed);
  }
}
function pathOf(campaignId: string, documentId?: string): string {
  const base = `/campaigns/${encodeURIComponent(campaignId)}/documents`;
  return documentId === undefined ? base : `${base}/${encodeURIComponent(documentId)}`;
}
function tabPathOf(campaignId: string, documentId: string, tabId?: string): string {
  const base = `${pathOf(campaignId, documentId)}/tabs`;
  return tabId === undefined ? base : `${base}/${encodeURIComponent(tabId)}`;
}
const REFUSAL_BY_CODE: Readonly<Record<string, DocumentsFailure['kind']>> = {
  DOCUMENT_VERSION_CONFLICT: 'conflict',
  DOCUMENT_ACTION_REUSED: 'action_reused',
  DOCUMENT_TAB_LIMIT: 'tab_limit',
  DOCUMENT_TAB_LAST: 'last_tab',
};
function offline(): DocumentsResult<never> {
  return { ok: false, failure: { kind: 'offline' } };
}
function refused(response: HttpResponse): DocumentsResult<never> {
  const code = errorCodeOf(response);
  const byCode = code === null ? undefined : REFUSAL_BY_CODE[code];
  if (byCode) return { ok: false, failure: { kind: byCode } };
  const statuses: Readonly<Record<number, DocumentsFailure['kind']>> = {
    400: 'invalid',
    401: 'unauthenticated',
    403: 'forbidden',
    404: 'not_found',
  };
  return { ok: false, failure: { kind: statuses[response.status] ?? 'unexpected' } };
}
