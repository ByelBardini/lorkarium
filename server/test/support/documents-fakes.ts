import { randomUUID } from 'node:crypto';
import { EMPTY_DOCUMENT_CONTENT } from '@lorkarium/contracts';
import type {
  DocumentDaos,
  DocumentsServiceDeps,
} from '../../src/modules/documents/document-writes.service';
import type {
  DocumentActionPo,
  DocumentChangesPo,
  DocumentPo,
  NewDocumentPo,
} from '../../src/modules/documents/documents.po';
import type {
  DocumentTabPo,
  DocumentTabSummaryPo,
  NewDocumentTabPo,
} from '../../src/modules/documents/document-tabs.po';
import type {
  DocumentTabChangesPo,
  DocumentTabPositionPo,
} from '../../src/modules/documents/document-tabs.dao';
import type { DocumentAssetPo } from '../../src/modules/documents/document-assets.po';
import { ClockFake } from './auth-fakes';
import { LibraryImagesHarness } from './library-images-fakes';
import { CAIO_ID, VHARN_ID, campaignMemberPo } from './campaigns-factories';
import { ANA_ID } from './auth-factories';

export const DOCUMENT_ID = 'd5da6333-8507-466c-9286-ab78e39bdd0c';
export const ACTION_ID = 'c6b4e619-c622-44e6-b153-b818ad4f4bd1';
export const GERAL_TAB_ID = '6f7a8b9c-0d1e-4f2a-8b3c-4d5e6f7a8b9c';
export const SEGREDOS_TAB_ID = '7a8b9c0d-1e2f-4a3b-9c4d-5e6f7a8b9c0d';
export const ITENS_TAB_ID = '8b9c0d1e-2f3a-4b4c-8d5e-6f7a8b9c0d1e';
export function documentPo(overrides: Partial<DocumentPo> = {}): DocumentPo {
  return {
    id: DOCUMENT_ID,
    campaignId: VHARN_ID,
    folderId: null,
    name: 'Documento sem nome',
    visibility: 'private',
    version: 0,
    createdBy: ANA_ID,
    createdAt: new Date('2026-10-29T15:00:00Z'),
    updatedAt: new Date('2026-10-29T15:00:00Z'),
    ...overrides,
  };
}
export function documentTabPo(overrides: Partial<DocumentTabPo> = {}): DocumentTabPo {
  return {
    campaignId: VHARN_ID,
    documentId: DOCUMENT_ID,
    id: GERAL_TAB_ID,
    name: 'Geral',
    position: 0,
    visibility: 'document',
    content: EMPTY_DOCUMENT_CONTENT,
    schemaVersion: 1,
    version: 0,
    createdAt: new Date('2026-10-29T15:00:00Z'),
    updatedAt: new Date('2026-10-29T15:00:00Z'),
    ...overrides,
  };
}
export function documentAssetPo(overrides: Partial<DocumentAssetPo> = {}): DocumentAssetPo {
  return {
    campaignId: VHARN_ID,
    documentId: DOCUMENT_ID,
    tabId: GERAL_TAB_ID,
    assetId: ACTION_ID,
    inContent: false,
    ...overrides,
  };
}
type DocumentOperations = DocumentDaos['documents'];
export class DocumentsDaoFake implements DocumentOperations {
  rows: DocumentPo[] = [];
  ownerRows: Record<string, string[]> = {};
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
type TabOperations = DocumentDaos['tabs'];
export class DocumentTabsDaoFake implements TabOperations {
  rows: DocumentTabPo[] = [];
  constructor(readonly journal: string[]) {}
  async listOfDocument(campaignId: string, documentId: string): Promise<DocumentTabSummaryPo[]> {
    this.journal.push('load tabs');
    return this.of(campaignId, documentId).sort((left, right) => left.position - right.position);
  }
  async findInDocument(
    campaignId: string,
    documentId: string,
    tabId: string,
  ): Promise<DocumentTabPo | undefined> {
    return this.of(campaignId, documentId).find((row) => row.id === tabId);
  }
  async insert(input: NewDocumentTabPo): Promise<DocumentTabPo> {
    const row = documentTabPo({ ...input, id: input.id ?? randomUUID() });
    this.rows.push(row);
    this.journal.push('insert tab');
    return row;
  }
  async update(
    campaignId: string,
    documentId: string,
    tabId: string,
    changes: DocumentTabChangesPo,
  ): Promise<DocumentTabSummaryPo> {
    const row = this.required(campaignId, documentId, tabId);
    Object.assign(row, changes);
    this.journal.push('update tab');
    return row;
  }
  async saveContent(
    campaignId: string,
    documentId: string,
    tabId: string,
    change: Readonly<{ content: unknown; updatedAt: Date }>,
  ): Promise<DocumentTabSummaryPo> {
    const row = this.required(campaignId, documentId, tabId);
    Object.assign(row, { ...change, version: row.version + 1 });
    this.journal.push('save content');
    return row;
  }
  async reorder(
    campaignId: string,
    documentId: string,
    order: readonly DocumentTabPositionPo[],
  ): Promise<void> {
    for (const { id, position } of order)
      this.required(campaignId, documentId, id).position = position;
    this.journal.push('reorder tabs');
  }
  async delete(campaignId: string, documentId: string, tabId: string): Promise<void> {
    this.rows = this.rows.filter((row) => row !== this.required(campaignId, documentId, tabId));
    this.journal.push('delete tab');
  }
  private of(campaignId: string, documentId: string): DocumentTabPo[] {
    return this.rows.filter(
      (row) => row.campaignId === campaignId && row.documentId === documentId,
    );
  }
  private required(campaignId: string, documentId: string, tabId: string): DocumentTabPo {
    const row = this.of(campaignId, documentId).find((candidate) => candidate.id === tabId);
    if (!row) throw new Error(`Missing tab ${tabId} of document ${documentId}`);
    return row;
  }
}
type AssetOperations = DocumentDaos['assets'];
export class DocumentAssetsDaoFake implements AssetOperations {
  rows: DocumentAssetPo[] = [];
  constructor(readonly journal: string[]) {}
  async ofDocument(campaignId: string, documentId: string): Promise<DocumentAssetPo[]> {
    return this.rows.filter(
      (row) => row.campaignId === campaignId && row.documentId === documentId,
    );
  }
  async ofAsset(campaignId: string, assetId: string): Promise<DocumentAssetPo[]> {
    return this.rows.filter((row) => row.campaignId === campaignId && row.assetId === assetId);
  }
  async prepare(
    campaignId: string,
    documentId: string,
    tabId: string,
    assetId: string,
  ): Promise<void> {
    this.rows.push(documentAssetPo({ campaignId, documentId, tabId, assetId }));
  }
  async confirmTab(
    campaignId: string,
    documentId: string,
    tabId: string,
    assetIds: readonly string[],
  ): Promise<void> {
    const inTab = (row: DocumentAssetPo) =>
      row.campaignId === campaignId && row.documentId === documentId && row.tabId === tabId;
    const kept = this.rows.filter((row) => !inTab(row) || !assetIds.includes(row.assetId));
    const confirmed = assetIds.map((assetId) =>
      documentAssetPo({ campaignId, documentId, tabId, assetId, inContent: true }),
    );
    this.rows = [
      ...kept.map((row) => (inTab(row) ? { ...row, inContent: false } : row)),
      ...confirmed,
    ];
    this.journal.push('confirm assets');
  }
}
/** Ids handed out in order (the document, then its "Geral" tab, then new tabs), then random. */
function idSequence(ids: readonly string[]): () => string {
  const pending = [...ids];
  return () => pending.shift() ?? randomUUID();
}
export class DocumentsHarness {
  readonly library = new LibraryImagesHarness();
  readonly journal = this.library.journal;
  readonly documents = new DocumentsDaoFake(this.journal);
  readonly tabs = new DocumentTabsDaoFake(this.journal);
  readonly assets = new DocumentAssetsDaoFake(this.journal);
  readonly requester = { campaignId: VHARN_ID, userId: ANA_ID };
  readonly daos: DocumentDaos = {
    ...this.library.daos,
    documents: this.documents,
    tabs: this.tabs,
    assets: this.assets,
  };
  failCommit = false;
  constructor() {
    // Ana masters Vharn and Bia plays (the library harness); Caio plays without owning anything.
    this.library.members.rows.push(
      campaignMemberPo({ userId: CAIO_ID, role: 'player', campaignId: VHARN_ID }),
    );
  }
  readonly deps: DocumentsServiceDeps = {
    read: this.daos,
    snapshot: (work) => work(this.daos),
    transaction: (work) => this.inTransaction(work),
    clock: new ClockFake(new Date('2026-10-29T15:00:00Z')),
    newId: idSequence([DOCUMENT_ID, GERAL_TAB_ID, ITENS_TAB_ID]),
    publisher: {
      libraryChanged: () => {
        this.journal.push('publish');
      },
    },
    tabLimit: 200,
  };
  /** The document "Diário" (version `version`) with "Geral" and the masters-only "Segredos". */
  withSecretTab(overrides: Partial<DocumentPo> = {}): this {
    this.documents.rows.push(documentPo({ name: 'Diário', version: 3, ...overrides }));
    this.tabs.rows.push(
      documentTabPo(),
      documentTabPo({ id: SEGREDOS_TAB_ID, name: 'Segredos', position: 1, visibility: 'masters' }),
    );
    return this;
  }
  private async inTransaction<T>(work: (daos: DocumentDaos) => Promise<T>): Promise<T> {
    const saved = structuredClone(this.stored());
    try {
      const result = await work(this.daos);
      if (this.failCommit) throw new Error('commit failed');
      this.journal.push('commit');
      return result;
    } catch (error) {
      this.restore(saved);
      throw error;
    }
  }
  private stored() {
    const { documents, tabs, assets } = this;
    return {
      rows: documents.rows,
      ownerRows: documents.ownerRows,
      actions: documents.actions,
      tabs: tabs.rows,
      assets: assets.rows,
    };
  }
  private restore(saved: ReturnType<DocumentsHarness['stored']>): void {
    Object.assign(this.documents, {
      rows: saved.rows,
      ownerRows: saved.ownerRows,
      actions: saved.actions,
    });
    this.tabs.rows = saved.tabs;
    this.assets.rows = saved.assets;
  }
}
