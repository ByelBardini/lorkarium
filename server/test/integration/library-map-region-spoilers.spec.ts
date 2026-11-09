import { describe, expect, it } from 'vitest';
import { MapRegionsOverHttp } from '../support/library-map-regions-http';
import type { SignedInUser } from '../support/sign-in';
import { useTokenTable } from '../support/token-table';

const live = useTokenTable();
const atlas = new MapRegionsOverHttp(live);

const documentLink = (id: string) => ({ link: { kind: 'document', id } });

async function regionOfBody(user: SignedInUser, mapId: string, regionId: string): Promise<unknown> {
  const body = (await atlas.readMap(user, mapId)).json<{ regions: { id: string }[] }>();
  return body.regions.find(({ id }) => id === regionId);
}

describe('the spoiler round: the raw body of GET /:mapId', () => {
  it('a hidden region is not in the body of Bia or of the spectator, in any form', async () => {
    const map = await atlas.createMap({ visibility: 'public' });
    const diario = await atlas.documentId('Testamento do Rei', 'public');
    const cofre = await atlas.addRegion(map.id, {
      name: 'Cofre Secreto',
      description: 'A coroa está aqui',
      hidden: true,
      ...documentLink(diario),
    });
    const visible = await atlas.addRegion(map.id, { name: 'Praça' });
    const duda = await live.signUp('Duda');
    await live.joinAsSpectator(duda, live.vharn);

    for (const reader of [live.bia, duda]) {
      const response = await atlas.readMap(reader, map.id);
      expect(response.statusCode, response.body).toBe(200);
      expect(response.body).not.toContain(cofre.id);
      expect(response.body).not.toContain('Cofre Secreto');
      expect(response.body).not.toContain('A coroa');
      expect(response.body).not.toContain(diario);
      expect(response.body).not.toContain('Testamento do Rei');
      expect(response.json()).toMatchObject({ regions: [{ id: visible.id }] });
    }
  });

  it('Ana reads the hidden region, marked as hidden', async () => {
    const map = await atlas.createMap();
    const cofre = await atlas.addRegion(map.id, { name: 'Cofre', hidden: true });

    expect(await atlas.detailOf(live.ana, map.id)).toMatchObject({
      regions: [{ id: cofre.id, name: 'Cofre', hidden: true }],
    });
  });

  it.each([
    ['document', () => atlas.documentId('Segredo do Rei', 'private')],
    ['scene', () => atlas.sceneId('Segredo do Rei', 'private')],
    ['map', async () => (await atlas.createMap({ name: 'Segredo do Rei' })).id],
    ['image', () => atlas.imageId('Segredo do Rei', 'private')],
  ] as const)(
    'a visible region over a private %s is locked: no id, no name, no kind in the body',
    async (kind, targetId) => {
      const map = await atlas.createMap({ visibility: 'public' });
      const id = await targetId();
      const region = await atlas.addRegion(map.id, { link: { kind, id } });

      const response = await atlas.readMap(live.bia, map.id);

      expect(response.statusCode, response.body).toBe(200);
      expect(response.json<{ regions: unknown[] }>().regions).toStrictEqual([
        { ...region, link: { state: 'locked' } },
      ]);
      expect(response.body).not.toContain(id);
      expect(response.body).not.toContain('Segredo do Rei');
      expect(response.body).not.toContain('"kind"');
      expect(response.body).not.toContain(`"${kind}"`);
    },
  );

  it('the same locked link reaches the spectator', async () => {
    const map = await atlas.createMap({ visibility: 'public' });
    const segredo = await atlas.documentId('Segredo do Rei', 'private');
    const region = await atlas.addRegion(map.id, documentLink(segredo));
    const duda = await live.signUp('Duda');
    await live.joinAsSpectator(duda, live.vharn);

    expect(await regionOfBody(duda, map.id, region.id)).toMatchObject({
      link: { state: 'locked' },
    });
    expect((await atlas.readMap(duda, map.id)).body).not.toContain(segredo);
  });

  it('a target deleted is removed, with its kind, for Ana and null for Bia', async () => {
    const map = await atlas.createMap({ visibility: 'public' });
    const diario = await atlas.documentId('Diário', 'public');
    const region = await atlas.addRegion(map.id, documentLink(diario));

    await atlas.deleteDocument(diario);

    expect(await regionOfBody(live.ana, map.id, region.id)).toMatchObject({
      link: { state: 'removed', kind: 'document' },
    });
    const body = await atlas.readMap(live.bia, map.id);
    expect(await regionOfBody(live.bia, map.id, region.id)).toMatchObject({ link: null });
    expect(body.body).not.toContain('"removed"');
    expect(body.body).not.toContain('"kind"');
  });
});

describe('what opens for a player', () => {
  async function linkOfBia(link: object): Promise<unknown> {
    const map = await atlas.createMap({ visibility: 'public' });
    const region = await atlas.addRegion(map.id, { link });
    const seen = await regionOfBody(live.bia, map.id, region.id);
    return (seen as { link: unknown }).link;
  }

  it('a public document, with its name', async () => {
    const id = await atlas.documentId('Diário', 'public');
    expect(await linkOfBia({ kind: 'document', id })).toStrictEqual({
      state: 'open',
      kind: 'document',
      id,
      name: 'Diário',
    });
  });

  it('a private document Bia owns', async () => {
    const id = await atlas.documentId('Diário', 'private');
    await atlas.makeOwner(id, live.bia);
    expect(await linkOfBia({ kind: 'document', id })).toMatchObject({ state: 'open', id });
  });

  it('a public grid', async () => {
    const id = await atlas.sceneId('Salão', 'public');
    expect(await linkOfBia({ kind: 'scene', id })).toMatchObject({ state: 'open', name: 'Salão' });
  });

  it('the private grid the group is on', async () => {
    const id = await atlas.sceneId('Salão', 'private');
    await atlas.makeGroupScene(id);
    expect(await linkOfBia({ kind: 'scene', id })).toMatchObject({ state: 'open', name: 'Salão' });
  });

  it('a public map', async () => {
    const other = await atlas.createMap({ name: 'Masmorra', visibility: 'public' });
    expect(await linkOfBia({ kind: 'map', id: other.id })).toMatchObject({
      state: 'open',
      name: 'Masmorra',
    });
  });

  it('a private map while it is the main one', async () => {
    const other = await atlas.createMap({ name: 'Masmorra' });
    await live.http(live.ana, { method: 'PUT', url: `${atlas.mapsUrl()}/${other.id}/main` });
    expect(await linkOfBia({ kind: 'map', id: other.id })).toMatchObject({
      state: 'open',
      name: 'Masmorra',
    });
  });

  it('a public image', async () => {
    const id = await atlas.imageId('Brasão', 'public');
    expect(await linkOfBia({ kind: 'image', id })).toMatchObject({
      state: 'open',
      name: 'Brasão',
    });
  });

  it('a private image while it is being presented', async () => {
    const id = await atlas.imageId('Brasão', 'private');
    await atlas.presentImage(id);
    expect(await linkOfBia({ kind: 'image', id })).toMatchObject({
      state: 'open',
      name: 'Brasão',
    });
  });
});

describe('reading the regions costs one query per kind of target', () => {
  async function detailQueries(mapId: string): Promise<number> {
    live.queries.reset();
    await atlas.detailOf(live.bia, mapId);
    return live.queries.count;
  }

  async function regionsOfEveryKind(mapId: string): Promise<void> {
    await atlas.addRegion(mapId, documentLink(await atlas.documentId('Diário', 'public')));
    const scene = await atlas.sceneId('Salão', 'public');
    await atlas.addRegion(mapId, { link: { kind: 'scene', id: scene } });
    const other = await atlas.createMap({ name: 'Masmorra', visibility: 'public' });
    await atlas.addRegion(mapId, { link: { kind: 'map', id: other.id } });
    const image = await atlas.imageId('Brasão', 'public');
    await atlas.addRegion(mapId, { link: { kind: 'image', id: image } });
  }

  it('three times the regions, the same number of queries', async () => {
    const map = await atlas.createMap({ visibility: 'public' });
    await regionsOfEveryKind(map.id);
    const few = await detailQueries(map.id);

    await regionsOfEveryKind(map.id);
    await regionsOfEveryKind(map.id);

    expect((await atlas.detailOf(live.ana, map.id)).regions).toHaveLength(12);
    expect(await detailQueries(map.id)).toBe(few);
  });
});
