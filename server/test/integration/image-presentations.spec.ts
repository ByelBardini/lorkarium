import {
  assetResponseDto,
  libraryImageDto,
  imagePresentationStateDto,
  imagePresentationChangedDto,
  campaignLibraryDto,
} from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { pngOf } from '../support/images';
import { useTokenTable } from '../support/token-table';
import { eventPayload, silence } from '../support/live-table';
import { recordEventsOf } from '../support/realtime-client';
const live = useTokenTable();
const imagesUrl = () => `/api/campaigns/${live.vharn.id}/library-images`;
const snapshotUrl = () => `/api/campaigns/${live.vharn.id}/image-presentation`;
async function image(name = 'Retrato') {
  const upload = await live.http(live.ana, {
    method: 'POST',
    url: `/api/campaigns/${live.vharn.id}/assets?purpose=library_image`,
    headers: { 'content-type': 'image/png' },
    payload: await pngOf(100, 60),
  });
  const asset = assetResponseDto.parse(upload.json()).asset;
  const saved = await live.http(live.ana, {
    method: 'POST',
    url: imagesUrl(),
    payload: { name, assetId: asset.id },
  });
  return libraryImageDto.parse(saved.json());
}
async function present(imageId: string) {
  const response = await live.http(live.ana, {
    method: 'POST',
    url: `${imagesUrl()}/${imageId}/presentations`,
  });
  expect(response.statusCode, response.body).toBe(200);
  return imagePresentationStateDto.parse(response.json());
}
async function snapshot() {
  return imagePresentationStateDto.parse(
    (await live.http(live.bia, { method: 'GET', url: snapshotUrl() })).json(),
  );
}
const read = (assetId: string) =>
  live.http(live.bia, { method: 'GET', url: `/api/assets/${assetId}` });
describe('authoritative persisted image presentations', () => {
  it('starts with version zero and no presentation', async () =>
    expect(await snapshot()).toMatchObject({ version: 0, presentation: null }));
  it('presents a private image to all campaign viewers including spectators; never reveals folder or publishes it', async () => {
    const duda = await live.signUp('Duda');
    await live.joinAsSpectator(duda, live.vharn);
    const outsider = await live.signUp('Elisa');
    await live.joinAsSpectator(outsider, live.quelm);
    const ana = recordEventsOf(await live.atTable(live.ana, live.vharn));
    const bia = recordEventsOf(await live.atTable(live.bia, live.vharn));
    const viewer = recordEventsOf(await live.atTable(duda, live.vharn));
    const other = recordEventsOf(await live.atTable(outsider, live.quelm));
    const item = await image();
    const state = await present(item.id);
    expect(state.version).toBe(1);
    for (const client of [ana, bia, viewer]) {
      const event = imagePresentationChangedDto.parse(
        await eventPayload(client, 'library:imagePresentationChanged'),
      );
      expect(event.presentation).toEqual(state.presentation);
      expect(event.presentation).not.toHaveProperty('folderId');
    }
    expect((await read(item.asset.id)).statusCode).toBe(200);
    expect(
      (await live.http(duda, { method: 'GET', url: `/api/assets/${item.asset.id}` })).statusCode,
    ).toBe(200);
    const library = campaignLibraryDto.parse(
      (
        await live.http(live.bia, { method: 'GET', url: `/api/campaigns/${live.vharn.id}/library` })
      ).json(),
    );
    expect(library.images).toEqual([]);
    expect(other.events.filter((e) => e.name === 'library:imagePresentationChanged')).toEqual([]);
    expect((await live.http(outsider, { method: 'GET', url: snapshotUrl() })).statusCode).toBe(404);
    expect(
      (await live.http(outsider, { method: 'GET', url: `/api/assets/${item.asset.id}` }))
        .statusCode,
    ).toBe(404);
  });
  it('new clicks get new identities and versions; rename does not rewrite the name already presented; replacement revokes the old private file', async () => {
    const a = await image('Antes');
    const p1 = await present(a.id);
    await live.http(live.ana, {
      method: 'PATCH',
      url: `${imagesUrl()}/${a.id}`,
      payload: { name: 'Depois' },
    });
    expect((await snapshot()).presentation?.name).toBe('Antes');
    const p2 = await present(a.id);
    expect(p2.presentation?.id).not.toBe(p1.presentation?.id);
    expect(p2.presentation?.name).toBe('Depois');
    expect(p2.version).toBe(2);
    const b = await image('Outra');
    await present(b.id);
    expect((await read(a.asset.id)).statusCode).toBe(404);
    expect((await read(b.asset.id)).statusCode).toBe(200);
    await live.restart();
    expect(await snapshot()).toMatchObject({ version: 3, presentation: { imageId: b.id } });
  });
  it('deleting the presented image clears it and increments the persisted version after commit', async () => {
    const item = await image();
    await present(item.id);
    const bia = recordEventsOf(await live.atTable(live.bia, live.vharn));
    expect(
      (await live.http(live.ana, { method: 'DELETE', url: `${imagesUrl()}/${item.id}` }))
        .statusCode,
    ).toBe(204);
    const event = imagePresentationChangedDto.parse(
      await eventPayload(bia, 'library:imagePresentationChanged'),
    );
    expect(event).toMatchObject({ version: 2, presentation: null });
    expect(await snapshot()).toMatchObject({ version: 2, presentation: null });
    expect((await read(item.asset.id)).statusCode).toBe(404);
  });
  it('refusals and rolled back writes emit no presentation and leave the previous state intact', async () => {
    const item = await image();
    const bia = recordEventsOf(await live.atTable(live.bia, live.vharn));
    expect(
      (
        await live.http(live.bia, {
          method: 'POST',
          url: `${imagesUrl()}/${item.id}/presentations`,
        })
      ).statusCode,
    ).toBe(403);
    await live.connection.db.execute(
      sql`CREATE FUNCTION reject_image_presentation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'presentation refused by test'; END; $$; CREATE TRIGGER reject_image_presentation BEFORE INSERT OR UPDATE ON library_image_presentations FOR EACH ROW EXECUTE FUNCTION reject_image_presentation()`,
    );
    try {
      const failed = await live.http(live.ana, {
        method: 'POST',
        url: `${imagesUrl()}/${item.id}/presentations`,
      });
      expect(failed.statusCode).toBe(500);
      expect(await snapshot()).toMatchObject({ version: 0, presentation: null });
    } finally {
      await live.connection.db.execute(
        sql`DROP TRIGGER reject_image_presentation ON library_image_presentations; DROP FUNCTION reject_image_presentation()`,
      );
    }
    await silence();
    expect(bia.events.filter((e) => e.name === 'library:imagePresentationChanged')).toEqual([]);
  });
  it('serializes presenting against deletion without ever leaving an excluded image current', async () => {
    const item = await image();
    const [shown, deleted] = await Promise.all([
      live.http(live.ana, { method: 'POST', url: `${imagesUrl()}/${item.id}/presentations` }),
      live.http(live.ana, { method: 'DELETE', url: `${imagesUrl()}/${item.id}` }),
    ]);
    expect([200, 404]).toContain(shown.statusCode);
    expect(deleted.statusCode).toBe(204);
    expect((await snapshot()).presentation).toBeNull();
    expect((await read(item.asset.id)).statusCode).toBe(404);
  });
});
