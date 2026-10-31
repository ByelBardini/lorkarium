import { documentWriteResponseDto } from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import { DocumentHttpHarness, documentText } from '../support/document-http';
import { useTokenTable } from '../support/token-table';

const live = useTokenTable();
const documents = new DocumentHttpHarness(live);
describe('document versioned edits and ownership', () => {
  it('allows both owners to read and edit private content but refuses administration and deletion', async () => {
    const created = await documents.create();
    const owned = await documents.administer(created, { ownerIds: [live.bia.id, live.caio.id] });
    expect(await documents.read(owned.id, live.bia)).toMatchObject({
      canEdit: true,
      canManage: false,
    });
    expect(await documents.read(owned.id, live.caio)).toMatchObject({
      canEdit: true,
      canManage: false,
    });
    const saved = await documents.save(owned, documentText('Dos dois'), live.bia);
    expect(saved).toMatchObject({ version: 1, tabs: [{ name: 'Geral', version: 1 }] });
    expect(
      (
        await live.http(live.bia, {
          method: 'PATCH',
          url: documents.url(owned.id),
          payload: { actionId: crypto.randomUUID(), expectedVersion: 1, visibility: 'public' },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await live.http(live.caio, {
          method: 'DELETE',
          url: documents.url(owned.id),
          payload: { actionId: crypto.randomUUID(), expectedVersion: 1 },
        })
      ).statusCode,
    ).toBe(403);
  });
  it('permits public reading without editing and rejects administrative fields on the content endpoint', async () => {
    const document = await documents.administer(await documents.create(), { visibility: 'public' });
    expect(await documents.read(document.id, live.bia)).toMatchObject({
      canEdit: false,
      canManage: false,
    });
    expect(
      (
        await live.http(live.bia, {
          method: 'PATCH',
          url: `${documents.url(document.id)}/content`,
          payload: {
            actionId: crypto.randomUUID(),
            expectedVersion: document.version,
            name: 'Proibido',
          },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await live.http(live.ana, {
          method: 'PATCH',
          url: `${documents.url(document.id)}/content`,
          payload: {
            actionId: crypto.randomUUID(),
            expectedVersion: document.version,
            name: 'Forjado',
            visibility: 'public',
          },
        })
      ).statusCode,
    ).toBe(400);
    expect((await documents.read(document.id)).version).toBe(1);
  });
  it('accepts one concurrent save and rejects the loser without overwriting the winner', async () => {
    const document = await documents.create();
    const responses = await Promise.all(
      ['Primeira', 'Segunda'].map((name) =>
        live.http(live.ana, {
          method: 'PATCH',
          url: `${documents.url(document.id)}/content`,
          payload: { actionId: crypto.randomUUID(), expectedVersion: 0, name },
        }),
      ),
    );
    expect(responses.map((response) => response.statusCode).sort()).toEqual([200, 409]);
    const winner = responses.find((response) => response.statusCode === 200);
    if (!winner) throw new Error('Expected exactly one successful document save');
    const confirmed = documentWriteResponseDto.parse(winner.json()).document;
    expect(await documents.read(document.id)).toMatchObject({ version: 1, name: confirmed.name });
    expect(responses.find((response) => response.statusCode === 409)?.json()).toMatchObject({
      code: 'DOCUMENT_VERSION_CONFLICT',
    });
  });
  it('replays the same action once and refuses reuse with another request', async () => {
    const document = await documents.create();
    const payload = { actionId: crypto.randomUUID(), expectedVersion: 0, name: 'Uma gravação' };
    const request = {
      method: 'PATCH' as const,
      url: `${documents.url(document.id)}/content`,
      payload,
    };
    expect((await live.http(live.ana, request)).statusCode).toBe(200);
    expect((await live.http(live.ana, request)).statusCode).toBe(200);
    expect(await documents.read(document.id)).toMatchObject({ name: 'Uma gravação', version: 1 });
    const reused = await live.http(live.ana, {
      ...request,
      payload: { ...payload, name: 'Outra gravação' },
    });
    expect(reused.statusCode).toBe(409);
    expect(reused.json()).toMatchObject({ code: 'DOCUMENT_ACTION_REUSED' });
  });
  it('revokes private access on owner removal and on demotion to spectator', async () => {
    let document = await documents.administer(await documents.create(), {
      ownerIds: [live.bia.id, live.caio.id],
    });
    document = await documents.administer(document, { ownerIds: [live.caio.id] });
    expect(
      (await live.http(live.bia, { method: 'GET', url: documents.url(document.id) })).statusCode,
    ).toBe(404);
    expect(
      (
        await live.http(live.ana, {
          method: 'PATCH',
          url: `/api/campaigns/${live.vharn.id}/members/${live.caio.id}`,
          payload: { role: 'spectator' },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (await live.http(live.caio, { method: 'GET', url: documents.url(document.id) })).statusCode,
    ).toBe(404);
  });
  it('refuses assigning a member from another campaign and preserves the private document', async () => {
    const outsider = await live.signUp('Duda');
    await live.joinAsSpectator(outsider, live.quelm);
    const document = await documents.create();
    const response = await live.http(live.ana, {
      method: 'PATCH',
      url: documents.url(document.id),
      payload: { actionId: crypto.randomUUID(), expectedVersion: 0, ownerIds: [outsider.id] },
    });
    expect(response.statusCode).toBe(403);
    expect(await documents.read(document.id)).toMatchObject({ version: 0, ownerIds: [] });
  });
  it('replays deletion without resurrecting the removed document', async () => {
    const document = await documents.create();
    const request = {
      method: 'DELETE' as const,
      url: documents.url(document.id),
      payload: { actionId: crypto.randomUUID(), expectedVersion: 0 },
    };
    expect((await live.http(live.ana, request)).statusCode).toBe(204);
    expect((await live.http(live.ana, request)).statusCode).toBe(204);
    expect(
      (await live.http(live.ana, { method: 'GET', url: documents.url(document.id) })).statusCode,
    ).toBe(404);
  });
});
