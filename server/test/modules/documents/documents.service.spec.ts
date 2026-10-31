import { describe, expect, it } from 'vitest';
import { DocumentsService } from '../../../src/modules/documents/documents.service';
import {
  ACTION_ID,
  DOCUMENT_ID,
  DocumentsHarness,
  documentPo,
} from '../../support/documents-fakes';
import { BIA_ID } from '../../support/campaigns-factories';

describe('DocumentsService', () => {
  it('master creates a private canonical document and commits the receipt before publishing', async () => {
    const harness = new DocumentsHarness();
    const result = await new DocumentsService(harness.deps).create(harness.requester, {
      actionId: ACTION_ID,
    });
    expect(result.document).toMatchObject({
      name: 'Documento sem nome',
      visibility: 'private',
      version: 0,
      ownerIds: [],
      content: { type: 'doc', content: [{ type: 'paragraph' }] },
    });
    expect(harness.journal).toEqual(['lock', 'insert', 'receipt', 'commit', 'publish']);
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
  it('unassociated asset refuses content and preserves old image references', async () => {
    const harness = new DocumentsHarness();
    harness.documents.rows.push(documentPo());
    await expect(
      new DocumentsService(harness.deps).updateContent(harness.requester, DOCUMENT_ID, {
        actionId: ACTION_ID,
        expectedVersion: 0,
        content: { type: 'doc', content: [{ type: 'image', attrs: { assetId: ACTION_ID } }] },
      }),
    ).rejects.toMatchObject({ code: 'DOCUMENT_ASSET_NOT_FOUND' });
    expect(harness.documents.referencesRows).toEqual([]);
    expect(harness.documents.rows[0]?.version).toBe(0);
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
