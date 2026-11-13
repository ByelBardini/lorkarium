import { describe, expect, it } from 'vitest';
import { DocumentsService } from '../../../src/modules/documents/documents.service';
import {
  ACTION_ID,
  DOCUMENT_ID,
  GERAL_TAB_ID,
  SEGREDOS_TAB_ID,
  DocumentsHarness,
  documentAssetPo,
  documentPo,
} from '../../support/documents-fakes';
import { BIA_ID } from '../../support/campaigns-factories';

describe('DocumentsService', () => {
  it('master creates a private document with its "Geral" tab and commits the receipt before publishing', async () => {
    const harness = new DocumentsHarness();
    const result = await new DocumentsService(harness.deps).create(harness.requester, {
      actionId: ACTION_ID,
    });
    expect(result.document).toMatchObject({
      name: 'Documento sem nome',
      visibility: 'private',
      version: 0,
      ownerIds: [],
      schemaVersion: 2,
      tabs: [{ id: GERAL_TAB_ID, name: 'Geral', visibility: 'document', version: 0 }],
    });
    expect(harness.tabs.rows[0]?.content).toEqual({
      type: 'doc',
      content: [{ type: 'paragraph' }],
    });
    expect(harness.journal).toEqual([
      'lock',
      'insert',
      'insert tab',
      'receipt',
      'load tabs',
      'commit',
      'publish',
    ]);
  });
  it('a free table creates a new document: its single "Geral" tab fits the plan', async () => {
    const harness = new DocumentsHarness();
    harness.campaigns.owner = {
      role: 'user',
      plan: 'free',
      lorkariumOwner: false,
    };
    const result = await new DocumentsService(harness.deps).create(harness.requester, {
      actionId: ACTION_ID,
    });
    expect(result.document.tabs.map(({ name }) => name)).toEqual(['Geral']);
  });
  it('same action replays its receipt without applying or publishing twice', async () => {
    const harness = new DocumentsHarness();
    const service = new DocumentsService(harness.deps);
    const first = await service.create(harness.requester, { actionId: ACTION_ID });
    const repeated = await service.create(harness.requester, { actionId: ACTION_ID });
    expect(repeated).toEqual(first);
    expect(harness.documents.rows).toHaveLength(1);
    expect(harness.journal.filter((item) => item === 'publish')).toEqual(['publish']);
  });
  it('same action with changed input refuses reuse without another document', async () => {
    const harness = new DocumentsHarness();
    const service = new DocumentsService(harness.deps);
    await service.create(harness.requester, { actionId: ACTION_ID });
    await expect(
      service.create(harness.requester, { actionId: ACTION_ID, name: 'Changed' }),
    ).rejects.toMatchObject({ code: 'DOCUMENT_ACTION_REUSED' });
    expect(harness.documents.rows.map((row) => row.name)).toEqual(['Documento sem nome']);
  });
  it('commit failure rolls back document and receipt and never publishes', async () => {
    const harness = new DocumentsHarness();
    harness.failCommit = true;
    await expect(
      new DocumentsService(harness.deps).create(harness.requester, { actionId: ACTION_ID }),
    ).rejects.toThrow('commit failed');
    expect(harness.documents.rows).toEqual([]);
    expect(harness.tabs.rows).toEqual([]);
    expect(harness.documents.actions).toEqual([]);
    expect(harness.journal).not.toContain('publish');
  });
  it('player cannot create and leaves storage untouched', async () => {
    const harness = new DocumentsHarness();
    await expect(
      new DocumentsService(harness.deps).create(
        { ...harness.requester, userId: BIA_ID },
        { actionId: ACTION_ID },
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(harness.documents.rows).toEqual([]);
    expect(harness.journal).not.toContain('publish');
  });
  it('stale save leaves the winning version and name untouched', async () => {
    const harness = new DocumentsHarness();
    harness.documents.rows.push(documentPo({ version: 4, name: 'Winner' }));
    await expect(
      new DocumentsService(harness.deps).updateContent(harness.requester, DOCUMENT_ID, {
        actionId: ACTION_ID,
        expectedVersion: 3,
        name: 'Loser',
      }),
    ).rejects.toMatchObject({ code: 'DOCUMENT_VERSION_CONFLICT' });
    expect(harness.documents.rows[0]).toMatchObject({ version: 4, name: 'Winner' });
    expect(harness.documents.actions).toEqual([]);
    expect(harness.journal).not.toContain('publish');
  });
  it('owner permission is rechecked before replaying an old action', async () => {
    const harness = new DocumentsHarness();
    harness.documents.rows.push(documentPo());
    harness.documents.ownerRows[DOCUMENT_ID] = [BIA_ID];
    const service = new DocumentsService(harness.deps);
    const player = { ...harness.requester, userId: BIA_ID };
    const input = { actionId: ACTION_ID, expectedVersion: 0, name: 'Saved' };
    await service.updateContent(player, DOCUMENT_ID, input);
    harness.documents.ownerRows[DOCUMENT_ID] = [];
    await expect(service.updateContent(player, DOCUMENT_ID, input)).rejects.toMatchObject({
      code: 'DOCUMENT_NOT_FOUND',
    });
    expect(harness.documents.rows[0]?.name).toBe('Saved');
  });
});

const MAPA = '1a1a1a1a-1a1a-4a1a-8a1a-1a1a1a1a1a1a';
const SELO = '1b1b1b1b-1b1b-4b1b-8b1b-1b1b1b1b1b1b';
describe('DocumentsService.updatePreview', () => {
  // "Diário" v3 owned by Bia: the map prepared in "Geral", the seal only in "Segredos".
  function diary(): DocumentsHarness {
    const harness = new DocumentsHarness().withSecretTab({ visibility: 'public' });
    harness.documents.ownerRows[DOCUMENT_ID] = [BIA_ID];
    harness.assets.rows.push(
      documentAssetPo({ assetId: MAPA, tabId: GERAL_TAB_ID }),
      documentAssetPo({ assetId: SELO, tabId: SEGREDOS_TAB_ID }),
    );
    return harness;
  }
  const bia = (harness: DocumentsHarness) => ({ ...harness.requester, userId: BIA_ID });
  const preview = { actionId: ACTION_ID, expectedVersion: 3, summary: 'Selada.' };

  it('the owner sets summary and cover, bumping the version, and it is published after the commit', async () => {
    const harness = diary();
    const result = await new DocumentsService(harness.deps).updatePreview(
      bia(harness),
      DOCUMENT_ID,
      { ...preview, imageAssetId: MAPA },
    );
    expect(result.document).toMatchObject({
      version: 4,
      preview: { summary: 'Selada.', imageAssetId: MAPA },
    });
    expect(result.receipt).toMatchObject({ operation: 'preview', version: 4 });
    expect(harness.journal.slice(-2)).toEqual(['commit', 'publish']);
  });
  it('null clears both', async () => {
    const harness = diary();
    harness.documents.rows[0]!.previewSummary = 'Velho';
    harness.documents.rows[0]!.previewAssetId = MAPA;
    const result = await new DocumentsService(harness.deps).updatePreview(
      harness.requester,
      DOCUMENT_ID,
      { ...preview, summary: null, imageAssetId: null },
    );
    expect(result.document.preview).toEqual({ summary: null, imageAssetId: null });
  });
  it('refuses the owner a cover only in the masters-only tab and writes nothing', async () => {
    const harness = diary();
    await expect(
      new DocumentsService(harness.deps).updatePreview(bia(harness), DOCUMENT_ID, {
        ...preview,
        imageAssetId: SELO,
      }),
    ).rejects.toMatchObject({ code: 'DOCUMENT_ASSET_NOT_FOUND' });
    expect(harness.documents.rows[0]).toMatchObject({ version: 3, previewAssetId: null });
    expect(harness.journal).not.toContain('publish');
  });
  it('a player who does not own the public document is forbidden', async () => {
    const harness = diary();
    harness.documents.ownerRows[DOCUMENT_ID] = [];
    await expect(
      new DocumentsService(harness.deps).updatePreview(bia(harness), DOCUMENT_ID, {
        ...preview,
        imageAssetId: null,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
  it('a stale version is a conflict and keeps the preview', async () => {
    const harness = diary();
    await expect(
      new DocumentsService(harness.deps).updatePreview(harness.requester, DOCUMENT_ID, {
        ...preview,
        expectedVersion: 2,
        imageAssetId: null,
      }),
    ).rejects.toMatchObject({ code: 'DOCUMENT_VERSION_CONFLICT' });
    expect(harness.documents.rows[0]?.previewSummary).toBeNull();
  });
  it('the same action replays without publishing twice', async () => {
    const harness = diary();
    const service = new DocumentsService(harness.deps);
    const input = { ...preview, imageAssetId: MAPA };
    const first = await service.updatePreview(harness.requester, DOCUMENT_ID, input);
    const repeated = await service.updatePreview(harness.requester, DOCUMENT_ID, input);
    expect(repeated).toEqual(first);
    expect(harness.journal.filter((item) => item === 'publish')).toEqual(['publish']);
  });
  it('a document of another table is not found', async () => {
    const harness = diary();
    harness.documents.rows[0]!.campaignId = '0e0e0e0e-0e0e-4e0e-8e0e-0e0e0e0e0e0e';
    await expect(
      new DocumentsService(harness.deps).updatePreview(harness.requester, DOCUMENT_ID, {
        ...preview,
        imageAssetId: null,
      }),
    ).rejects.toMatchObject({ code: 'DOCUMENT_NOT_FOUND' });
  });
});
