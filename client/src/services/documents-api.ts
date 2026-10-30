import {
  assetResponseDto,
  documentResponseDto,
  documentWriteResponseDto,
  type AssetDto,
  type DocumentDto,
  type DocumentWriteResponseDto,
  type CreateDocumentRequestDto,
  type UpdateDocumentContentRequestDto,
  type UpdateDocumentRequestDto,
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
  uploadImage(
    campaignId: string,
    documentId: string,
    file: Blob,
  ): Promise<DocumentsResult<AssetDto>>;
  importImage(
    campaignId: string,
    documentId: string,
    url: string,
  ): Promise<DocumentsResult<AssetDto>>;
  libraryImage(
    campaignId: string,
    documentId: string,
    imageId: string,
  ): Promise<DocumentsResult<AssetDto>>;
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
    file: Blob,
  ): Promise<DocumentsResult<AssetDto>> {
    try {
      const response = await this.transport.upload(
        `${pathOf(campaignId, documentId)}/images`,
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
    url: string,
  ): Promise<DocumentsResult<AssetDto>> {
    const result = await this.answer(
      'POST',
      `${pathOf(campaignId, documentId)}/images/import`,
      assetResponseDto,
      { url },
    );
    return result.ok ? { ok: true, value: result.value.asset } : result;
  }
  async libraryImage(
    campaignId: string,
    documentId: string,
    imageId: string,
  ): Promise<DocumentsResult<AssetDto>> {
    const result = await this.answer(
      'POST',
      `${pathOf(campaignId, documentId)}/images/from-library`,
      assetResponseDto,
      { imageId },
    );
    return result.ok ? { ok: true, value: result.value.asset } : result;
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
function offline(): DocumentsResult<never> {
  return { ok: false, failure: { kind: 'offline' } };
}
function refused(response: HttpResponse): DocumentsResult<never> {
  const code = errorCodeOf(response);
  if (code === 'DOCUMENT_VERSION_CONFLICT') return { ok: false, failure: { kind: 'conflict' } };
  if (code === 'DOCUMENT_ACTION_REUSED') return { ok: false, failure: { kind: 'action_reused' } };
  const statuses: Readonly<Record<number, DocumentsFailure['kind']>> = {
    400: 'invalid',
    401: 'unauthenticated',
    403: 'forbidden',
    404: 'not_found',
  };
  return { ok: false, failure: { kind: statuses[response.status] ?? 'unexpected' } };
}
