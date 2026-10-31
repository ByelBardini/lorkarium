import { EMPTY_DOCUMENT_CONTENT } from '@lorkarium/contracts';
import type {
  DocumentDaos,
  DocumentsServiceDeps,
} from '../../src/modules/documents/documents.service';
import type {
  DocumentActionPo,
  DocumentChangesPo,
  DocumentPo,
  NewDocumentPo,
} from '../../src/modules/documents/documents.po';
import { ClockFake } from './auth-fakes';
import { LibraryImagesHarness } from './library-images-fakes';
import { VHARN_ID } from './campaigns-factories';
import { ANA_ID } from './auth-factories';

export const DOCUMENT_ID = 'd5da6333-8507-466c-9286-ab78e39bdd0c';
export const ACTION_ID = 'c6b4e619-c622-44e6-b153-b818ad4f4bd1';
export type LibraryDocumentReference = Readonly<{
  campaignId: string;
  documentId: string;
  assetId: string;
  inContent: boolean;
}>;
export function documentPo(overrides: Partial<DocumentPo> = {}): DocumentPo {
  return {
    id: DOCUMENT_ID,
    campaignId: VHARN_ID,
    folderId: null,
    name: 'Documento sem nome',
    content: EMPTY_DOCUMENT_CONTENT,
    visibility: 'private',
    version: 0,
    schemaVersion: 1,
    createdBy: ANA_ID,
    createdAt: new Date('2026-10-29T15:00:00Z'),
    updatedAt: new Date('2026-10-29T15:00:00Z'),
    ...overrides,
  };
}
type DocumentOperations = DocumentDaos['documents'];
export class DocumentsDaoFake implements DocumentOperations {
  rows: DocumentPo[] = [];
  ownerRows: Record<string, string[]> = {};
  referencesRows: LibraryDocumentReference[] = [];
  actions: DocumentActionPo[] = [];
  constructor(readonly journal: string[]) {}
  async findInCampaign(campaignId: string, documentId: string): Promise<DocumentPo | undefined> {
    return this.rows.find((row) => row.campaignId === campaignId && row.id === documentId);
  }
  async insert(input: NewDocumentPo): Promise<DocumentPo> {
    const row = documentPo(input);
    this.rows.push(row);
    this.journal.push('insert');
    return row;
  }
  async update(
    campaignId: string,
    documentId: string,
    input: DocumentChangesPo,
  ): Promise<DocumentPo> {
    const row = await this.findInCampaign(campaignId, documentId);
    if (!row) throw new Error(`Missing document ${documentId}`);
    Object.assign(row, input);
    this.journal.push('update');
    return row;
  }
  async delete(campaignId: string, documentId: string): Promise<void> {
    this.rows = this.rows.filter((row) => row.campaignId !== campaignId || row.id !== documentId);
    this.journal.push('delete');
  }
  async owners(_campaignId: string, documentId: string): Promise<string[]> {
    return this.ownerRows[documentId] ?? [];
  }
  async replaceOwners(
    _campaignId: string,
    documentId: string,
    ownerIds: readonly string[],
  ): Promise<void> {
    this.ownerRows[documentId] = [...ownerIds];
  }
  async references(campaignId: string, documentId: string): Promise<LibraryDocumentReference[]> {
    return this.referencesRows.filter(
      (row) => row.campaignId === campaignId && row.documentId === documentId,
    );
  }
  async documentsForAsset(
    campaignId: string,
    assetId: string,
  ): Promise<LibraryDocumentReference[]> {
    return this.referencesRows.filter(
      (row) => row.campaignId === campaignId && row.assetId === assetId,
    );
  }
  async associateAsset(campaignId: string, documentId: string, assetId: string): Promise<void> {
    this.referencesRows.push({ campaignId, documentId, assetId, inContent: false });
  }
  async confirmAssets(
    campaignId: string,
    documentId: string,
    assetIds: readonly string[],
  ): Promise<void> {
    this.referencesRows = this.referencesRows.map((row) =>
      row.campaignId === campaignId && row.documentId === documentId
        ? { ...row, inContent: assetIds.includes(row.assetId) }
        : row,
    );
  }
  async action(
    campaignId: string,
    userId: string,
    actionId: string,
  ): Promise<DocumentActionPo | undefined> {
    return this.actions.find(
      (row) => row.campaignId === campaignId && row.userId === userId && row.actionId === actionId,
    );
  }
  async recordAction(row: DocumentActionPo): Promise<void> {
    this.actions.push(row);
    this.journal.push('receipt');
  }
}
export class DocumentsHarness {
  readonly library = new LibraryImagesHarness();
  readonly journal = this.library.journal;
  readonly documents = new DocumentsDaoFake(this.journal);
  readonly requester = { campaignId: VHARN_ID, userId: ANA_ID };
  readonly daos: DocumentDaos = { ...this.library.daos, documents: this.documents };
  failCommit = false;
  readonly deps: DocumentsServiceDeps = {
    read: this.daos,
    snapshot: (work) => work(this.daos),
    transaction: async (work) => {
      const saved = structuredClone({
        rows: this.documents.rows,
        owners: this.documents.ownerRows,
        refs: this.documents.referencesRows,
        actions: this.documents.actions,
      });
      try {
        const result = await work(this.daos);
        if (this.failCommit) throw new Error('commit failed');
        this.journal.push('commit');
        return result;
      } catch (error) {
        Object.assign(this.documents, {
          rows: saved.rows,
          ownerRows: saved.owners,
          referencesRows: saved.refs,
          actions: saved.actions,
        });
        throw error;
      }
    },
    clock: new ClockFake(new Date('2026-10-29T15:00:00Z')),
    newId: () => DOCUMENT_ID,
    publisher: {
      libraryChanged: () => {
        this.journal.push('publish');
      },
    },
  };
}
