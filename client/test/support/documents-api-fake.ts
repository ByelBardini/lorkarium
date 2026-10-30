import type {
  AssetDto,
  CreateDocumentRequestDto,
  DocumentDto,
  DocumentWriteResponseDto,
  UpdateDocumentContentRequestDto,
  UpdateDocumentRequestDto,
} from '@lorkarium/contracts';
import type { DocumentsApi, DocumentsResult } from '@/services/documents-api';
import { documentFixture, documentWrite } from './documents-fixtures';

export class DocumentsApiFake implements DocumentsApi {
  document = documentFixture();
  detailResult: DocumentsResult<DocumentDto> | null = null;
  saveResult: DocumentsResult<DocumentWriteResponseDto> | null = null;
  saves: UpdateDocumentContentRequestDto[] = [];
  updates: UpdateDocumentRequestDto[] = [];
  updateResult: DocumentsResult<DocumentWriteResponseDto> | null = null;
  imageResult: DocumentsResult<AssetDto> = { ok: false, failure: { kind: 'offline' } };
  imageRequests: {
    operation: 'upload' | 'import' | 'library';
    campaignId: string;
    documentId: string;
    file?: Blob;
    source?: string;
  }[] = [];
  heldSave: ((answer: DocumentsResult<DocumentWriteResponseDto>) => void) | null = null;
  holdSave = false;
  detailCalls = 0;
  heldDetail: Promise<DocumentsResult<DocumentDto>> | null = null;
  async detail(): Promise<DocumentsResult<DocumentDto>> {
    this.detailCalls++;
    if (this.heldDetail) return this.heldDetail;
    return this.detailResult ?? { ok: true, value: this.document };
  }
  async create(
    _campaignId: string,
    input: CreateDocumentRequestDto,
  ): Promise<DocumentsResult<DocumentWriteResponseDto>> {
    this.document = documentFixture({
      name: input.name ?? 'Documento sem nome',
      folderId: input.folderId ?? null,
    });
    return { ok: true, value: documentWrite(this.document) };
  }
  async save(
    _campaignId: string,
    _documentId: string,
    input: UpdateDocumentContentRequestDto,
  ): Promise<DocumentsResult<DocumentWriteResponseDto>> {
    this.saves.push(input);
    if (this.holdSave)
      return new Promise((resolve) => {
        this.heldSave = resolve;
      });
    if (this.saveResult) return this.saveResult;
    this.document = { ...this.document, ...input, version: input.expectedVersion + 1 };
    return { ok: true, value: documentWrite(this.document) };
  }
  async update(
    _campaignId: string,
    _documentId: string,
    input: UpdateDocumentRequestDto,
  ): Promise<DocumentsResult<DocumentWriteResponseDto>> {
    this.updates.push(input);
    if (this.updateResult) return this.updateResult;
    this.document = { ...this.document, ...input, version: input.expectedVersion + 1 };
    return { ok: true, value: documentWrite(this.document) };
  }
  async remove(): Promise<DocumentsResult<null>> {
    return { ok: true, value: null };
  }
  async uploadImage(
    campaignId: string,
    documentId: string,
    file: Blob,
  ): Promise<DocumentsResult<AssetDto>> {
    this.imageRequests.push({ operation: 'upload', campaignId, documentId, file });
    return this.imageResult;
  }
  async importImage(
    campaignId: string,
    documentId: string,
    source: string,
  ): Promise<DocumentsResult<AssetDto>> {
    this.imageRequests.push({ operation: 'import', campaignId, documentId, source });
    return this.imageResult;
  }
  async libraryImage(
    campaignId: string,
    documentId: string,
    source: string,
  ): Promise<DocumentsResult<AssetDto>> {
    this.imageRequests.push({ operation: 'library', campaignId, documentId, source });
    return this.imageResult;
  }
}
