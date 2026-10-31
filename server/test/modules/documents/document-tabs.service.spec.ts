import { describe, expect, it } from 'vitest';
import { DocumentTabsService } from '../../../src/modules/documents/document-tabs.service';
import { documentText } from '../../support/document-http';
import {
  ACTION_ID,
  DOCUMENT_ID,
  DocumentsHarness,
  GERAL_TAB_ID,
  ITENS_TAB_ID,
  SEGREDOS_TAB_ID,
  documentAssetPo,
} from '../../support/documents-fakes';
import { BIA_ID } from '../../support/campaigns-factories';

const PORTRAIT = '9c0d1e2f-3a4b-4c5d-8e6f-7a8b9c0d1e2f';
function imageBody(assetId: string) {
  return { type: 'doc' as const, content: [{ type: 'image' as const, attrs: { assetId } }] };
}
function serviceWith(harness: DocumentsHarness): DocumentTabsService {
  return new DocumentTabsService(harness.deps);
}
// The "Diário" at version 3 with "Geral" and the masters-only "Segredos", Bia owning it.
function diary(): DocumentsHarness {
  const harness = new DocumentsHarness().withSecretTab();
  harness.documents.ownerRows[DOCUMENT_ID] = [BIA_ID];
  harness.deps.newId();
  harness.deps.newId();
  harness.journal.length = 0;
  return harness;
}
const bia = (harness: DocumentsHarness) => ({ ...harness.requester, userId: BIA_ID });
const versioned = { actionId: ACTION_ID, expectedVersion: 3 };

describe('DocumentTabsService structural changes', () => {
  it('creating a tab locks, loads the tabs, inserts, bumps the document, records and only then publishes', async () => {
    const harness = diary();
    const result = await serviceWith(harness).create(harness.requester, DOCUMENT_ID, {
      ...versioned,
      name: 'Itens',
    });
    expect(harness.journal).toEqual([
      'lock',
      'load tabs',
      'insert tab',
      'update',
      'receipt',
      'load tabs',
      'commit',
      'publish',
    ]);
    expect(result.receipt).toEqual({
      actionId: ACTION_ID,
      documentId: DOCUMENT_ID,
      tabId: ITENS_TAB_ID,
      version: 4,
      operation: 'tab-create',
    });
    expect(result.document.tabs.map((tab) => [tab.name, tab.id])).toEqual([
      ['Geral', GERAL_TAB_ID],
      ['Segredos', SEGREDOS_TAB_ID],
      ['Itens', ITENS_TAB_ID],
    ]);
  });
  it('the owner renaming a visible tab bumps the document and answers without the hidden tab', async () => {
    const harness = diary();
    const result = await serviceWith(harness).update(bia(harness), DOCUMENT_ID, GERAL_TAB_ID, {
      ...versioned,
      name: 'Resumo',
    });
    expect(result.document).toMatchObject({ version: 4, tabs: [{ name: 'Resumo' }] });
    expect(result.receipt).toMatchObject({ tabId: GERAL_TAB_ID, operation: 'tab-update' });
    expect(harness.journal.slice(-2)).toEqual(['commit', 'publish']);
  });
  it('the master hiding a tab stores the visibility and records tab-update', async () => {
    const harness = diary();
    await serviceWith(harness).update(harness.requester, DOCUMENT_ID, GERAL_TAB_ID, {
      ...versioned,
      visibility: 'masters',
    });
    expect(harness.tabs.rows[0]).toMatchObject({ id: GERAL_TAB_ID, visibility: 'masters' });
  });
  it('the owner reordering only what they see keeps the hidden tab in its slot', async () => {
    const harness = diary();
    await serviceWith(harness).create(harness.requester, DOCUMENT_ID, versioned);
    const result = await serviceWith(harness).reorder(bia(harness), DOCUMENT_ID, {
      actionId: crypto.randomUUID(),
      expectedVersion: 4,
      tabIds: [ITENS_TAB_ID, GERAL_TAB_ID],
    });
    const order = [...harness.tabs.rows].sort((left, right) => left.position - right.position);
    expect(order.map((tab) => tab.id)).toEqual([ITENS_TAB_ID, SEGREDOS_TAB_ID, GERAL_TAB_ID]);
    expect(result.receipt).toMatchObject({ operation: 'tab-reorder', version: 5 });
    expect(result.receipt).not.toHaveProperty('tabId');
  });
  it('deleting a tab removes it and bumps the document version', async () => {
    const harness = diary();
    const result = await serviceWith(harness).delete(
      harness.requester,
      DOCUMENT_ID,
      SEGREDOS_TAB_ID,
      versioned,
    );
    expect(harness.tabs.rows.map((tab) => tab.id)).toEqual([GERAL_TAB_ID]);
    expect(result.receipt).toMatchObject({ operation: 'tab-delete', version: 4 });
  });
  it('the same actionId with the same request replays the receipt without applying or publishing again', async () => {
    const harness = diary();
    const service = serviceWith(harness);
    const first = await service.create(harness.requester, DOCUMENT_ID, versioned);
    const repeated = await service.create(harness.requester, DOCUMENT_ID, versioned);
    expect(repeated.receipt).toEqual(first.receipt);
    expect(harness.tabs.rows).toHaveLength(3);
    expect(harness.journal.filter((entry) => entry === 'publish')).toEqual(['publish']);
  });
  it('a retransmitted delete replays even though the tab is already gone', async () => {
    const harness = diary();
    const service = serviceWith(harness);
    await service.delete(harness.requester, DOCUMENT_ID, SEGREDOS_TAB_ID, versioned);
    const repeated = await service.delete(
      harness.requester,
      DOCUMENT_ID,
      SEGREDOS_TAB_ID,
      versioned,
    );
    expect(repeated.receipt).toMatchObject({ operation: 'tab-delete', tabId: SEGREDOS_TAB_ID });
  });
  it('the same actionId with another request is refused with DOCUMENT_ACTION_REUSED', async () => {
    const harness = diary();
    const service = serviceWith(harness);
    await service.create(harness.requester, DOCUMENT_ID, versioned);
    await expect(
      service.create(harness.requester, DOCUMENT_ID, { ...versioned, name: 'Outra' }),
    ).rejects.toMatchObject({ code: 'DOCUMENT_ACTION_REUSED' });
    expect(harness.tabs.rows).toHaveLength(3);
  });
  it('a stale document version is refused with DOCUMENT_VERSION_CONFLICT before writing', async () => {
    const harness = diary();
    await expect(
      serviceWith(harness).create(harness.requester, DOCUMENT_ID, {
        ...versioned,
        expectedVersion: 2,
      }),
    ).rejects.toMatchObject({ code: 'DOCUMENT_VERSION_CONFLICT' });
    expect(harness.tabs.rows).toHaveLength(2);
    expect(harness.documents.rows[0]?.version).toBe(3);
    expect(harness.journal).not.toContain('publish');
  });
  it('the owner deleting the hidden tab is refused as not found and nothing changes', async () => {
    const harness = diary();
    await expect(
      serviceWith(harness).delete(bia(harness), DOCUMENT_ID, SEGREDOS_TAB_ID, versioned),
    ).rejects.toMatchObject({ code: 'DOCUMENT_TAB_NOT_FOUND' });
    expect(harness.tabs.rows).toHaveLength(2);
    expect(harness.documents.actions).toEqual([]);
  });
  it('a commit failure rolls back the tab, the document version and the receipt', async () => {
    const harness = diary();
    harness.failCommit = true;
    await expect(
      serviceWith(harness).create(harness.requester, DOCUMENT_ID, versioned),
    ).rejects.toThrow('commit failed');
    expect(harness.tabs.rows).toHaveLength(2);
    expect(harness.documents.rows[0]?.version).toBe(3);
    expect(harness.journal).not.toContain('publish');
  });
});

describe('DocumentTabsService tab content', () => {
  it('saving a body compares the tab version, saves, confirms images, records and publishes', async () => {
    const harness = diary();
    const result = await serviceWith(harness).updateContent(
      bia(harness),
      DOCUMENT_ID,
      GERAL_TAB_ID,
      { actionId: ACTION_ID, expectedVersion: 0, content: documentText('Corda') },
    );
    expect(harness.journal).toEqual([
      'lock',
      'load tabs',
      'confirm assets',
      'save content',
      'receipt',
      'commit',
      'publish',
    ]);
    expect(result).toEqual({
      tab: expect.objectContaining({ id: GERAL_TAB_ID, version: 1 }),
      receipt: {
        actionId: ACTION_ID,
        documentId: DOCUMENT_ID,
        tabId: GERAL_TAB_ID,
        version: 1,
        operation: 'tab-content',
      },
    });
    expect(harness.documents.rows[0]?.version).toBe(3);
  });
  it('a stale tab version is refused with DOCUMENT_VERSION_CONFLICT without saving', async () => {
    const harness = diary();
    await expect(
      serviceWith(harness).updateContent(harness.requester, DOCUMENT_ID, GERAL_TAB_ID, {
        actionId: ACTION_ID,
        expectedVersion: 3,
        content: documentText('Perdedor'),
      }),
    ).rejects.toMatchObject({ code: 'DOCUMENT_VERSION_CONFLICT' });
    expect(harness.tabs.rows[0]).toMatchObject({ version: 0 });
    expect(harness.documents.actions).toEqual([]);
    expect(harness.journal).not.toContain('publish');
  });
  it('a repeated body save replays its receipt without saving again', async () => {
    const harness = diary();
    const service = serviceWith(harness);
    const input = { actionId: ACTION_ID, expectedVersion: 0, content: documentText('Corda') };
    const first = await service.updateContent(harness.requester, DOCUMENT_ID, GERAL_TAB_ID, input);
    const repeated = await service.updateContent(
      harness.requester,
      DOCUMENT_ID,
      GERAL_TAB_ID,
      input,
    );
    expect(repeated.receipt).toEqual(first.receipt);
    expect(harness.tabs.rows[0]?.version).toBe(1);
  });
  it('an image never associated with a visible tab refuses the body and keeps the references', async () => {
    const harness = diary();
    harness.assets.rows.push(documentAssetPo({ tabId: SEGREDOS_TAB_ID, assetId: PORTRAIT }));
    await expect(
      serviceWith(harness).updateContent(bia(harness), DOCUMENT_ID, GERAL_TAB_ID, {
        actionId: ACTION_ID,
        expectedVersion: 0,
        content: imageBody(PORTRAIT),
      }),
    ).rejects.toMatchObject({ code: 'DOCUMENT_ASSET_NOT_FOUND' });
    expect(harness.assets.rows).toEqual([
      documentAssetPo({ tabId: SEGREDOS_TAB_ID, assetId: PORTRAIT }),
    ]);
  });
  it('an image of another visible tab is confirmed in this tab too', async () => {
    const harness = diary();
    harness.assets.rows.push(documentAssetPo({ tabId: SEGREDOS_TAB_ID, assetId: PORTRAIT }));
    await serviceWith(harness).updateContent(harness.requester, DOCUMENT_ID, GERAL_TAB_ID, {
      actionId: ACTION_ID,
      expectedVersion: 0,
      content: imageBody(PORTRAIT),
    });
    expect(harness.assets.rows).toContainEqual(
      documentAssetPo({ tabId: GERAL_TAB_ID, assetId: PORTRAIT, inContent: true }),
    );
  });
  it('an image taken out of the body falls back to prepared in that tab', async () => {
    const harness = diary();
    harness.assets.rows.push(documentAssetPo({ assetId: PORTRAIT, inContent: true }));
    await serviceWith(harness).updateContent(harness.requester, DOCUMENT_ID, GERAL_TAB_ID, {
      actionId: ACTION_ID,
      expectedVersion: 0,
      content: documentText('Sem imagem'),
    });
    expect(harness.assets.rows).toEqual([documentAssetPo({ assetId: PORTRAIT, inContent: false })]);
  });
  it('reading the hidden tab as its owner is refused as not found', async () => {
    const harness = diary();
    await expect(
      serviceWith(harness).get(bia(harness), DOCUMENT_ID, SEGREDOS_TAB_ID),
    ).rejects.toMatchObject({ code: 'DOCUMENT_TAB_NOT_FOUND' });
  });
  it('reading a visible tab returns its body', async () => {
    const harness = diary();
    expect(await serviceWith(harness).get(bia(harness), DOCUMENT_ID, GERAL_TAB_ID)).toMatchObject({
      id: GERAL_TAB_ID,
      schemaVersion: 1,
      content: { type: 'doc', content: [{ type: 'paragraph' }] },
    });
  });
});
