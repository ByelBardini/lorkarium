import { libraryDto, librarySceneDto, type LibrarySceneDto } from '@lorkarium/contracts';
import { eq, inArray } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { combatantTokens, combatants, combats } from '../../src/modules/combat/combat.po';
import { activeConditions } from '../../src/modules/conditions/conditions.po';
import { ConditionsDao } from '../../src/modules/conditions/conditions.dao';
import { DrawingsDao } from '../../src/modules/drawings/drawings.dao';
import { EffectAreasDao } from '../../src/modules/effect-areas/effect-areas.dao';
import { LightsDao } from '../../src/modules/lights/lights.dao';
import { TokensDao, type TokenRow } from '../../src/modules/tokens/tokens.dao';
import type { TokenBarPo, TokenPo } from '../../src/modules/tokens/tokens.po';
import { WallsDao } from '../../src/modules/walls/walls.dao';
import type { WallPo } from '../../src/modules/walls/walls.po';
import { biaConePo } from '../support/effect-areas-factories';
import { squarePo } from '../support/drawings-factories';
import { corridorTorchPo } from '../support/lights-factories';
import { bramRow, inspirationBar, lyraPo, pvBar } from '../support/tokens-factories';
import { cellDoorPo, northWallPo } from '../support/walls-factories';
import { useTokenTable } from '../support/token-table';

const live = useTokenTable();

function libraryUrl(): string {
  return `/api/campaigns/${live.vharn.id}/scenes`;
}

async function groupSceneId(): Promise<string> {
  const response = await live.http(live.ana, { method: 'GET', url: libraryUrl() });
  const { activeSceneId } = libraryDto.parse(response.json());
  if (!activeSceneId) throw new Error(`Vharn came without a group grid: ${response.body}`);
  return activeSceneId;
}

function duplicate(sceneId: string, user = live.ana) {
  return live.http(user, { method: 'POST', url: `${libraryUrl()}/${sceneId}/copies` });
}

async function duplicated(sceneId: string): Promise<LibrarySceneDto> {
  const response = await duplicate(sceneId);
  if (response.statusCode !== 201) throw new Error(`duplicate answered ${response.body}`);
  return librarySceneDto.parse(response.json());
}

// The row as it is inserted: without the keys the database fills (id, order, dates).
function insertable<T extends object, K extends keyof T>(row: T, keys: readonly K[]): Omit<T, K> {
  const fields: Partial<T> = { ...row };
  for (const key of keys) delete fields[key];
  return fields as Omit<T, K>;
}

function newToken(token: TokenPo): Omit<TokenPo, 'id' | 'createdAt' | 'updatedAt'> {
  return insertable(token, ['id', 'createdAt', 'updatedAt']);
}

function newBar(bar: TokenBarPo): Omit<TokenBarPo, 'id' | 'tokenId' | 'position'> {
  return insertable(bar, ['id', 'tokenId', 'position']);
}

function newWall(wall: WallPo): Omit<WallPo, 'id' | 'wallOrder' | 'createdAt'> {
  return insertable(wall, ['id', 'wallOrder', 'createdAt']);
}

// Lyra: two bars, Bia's, Envenenado for 2 rounds, a fire light and sight 18/36.
async function placeLyra(sceneId: string): Promise<TokenRow> {
  const lyra = lyraPo({
    sceneId,
    sightBright: '18.00',
    sightDim: '36.00',
    lightBright: '4.00',
    lightDim: '4.00',
    lightColor: 'fire',
  });
  const bars = [newBar(pvBar()), newBar(inspirationBar())];
  const tokens = new TokensDao(live.connection.db);
  const row = await tokens.insert({ token: newToken(lyra), bars, controllerIds: [live.bia.id] });
  const conditions = new ConditionsDao(live.connection.db);
  const poisoned = await conditions.findDefinitionByName(live.vharn.id, 'Envenenado');
  if (!poisoned) throw new Error('Vharn came without Envenenado');
  await live.connection.db.insert(activeConditions).values({
    tokenId: row.token.id,
    conditionId: poisoned.id,
    remainingRounds: 2,
    appliedRound: 1,
  });
  return row;
}

async function placeBram(sceneId: string): Promise<TokenRow> {
  const bram = bramRow();
  const token = newToken({ ...bram.token, sceneId });
  return new TokensDao(live.connection.db).insert({
    ...bram,
    token,
    controllerIds: [live.caio.id],
  });
}

async function furnish(sceneId: string): Promise<void> {
  const walls = [northWallPo({ sceneId }), northWallPo({ sceneId, y: '8.00' })];
  walls.push(cellDoorPo({ sceneId, doorState: 'open' }));
  await new WallsDao(live.connection.db).insertMany(walls.map(newWall));
  const torch = insertable(corridorTorchPo({ sceneId, lit: false }), [
    'id',
    'lightOrder',
    'createdAt',
  ]);
  await new LightsDao(live.connection.db).insertMany([torch]);
  const square = squarePo({ sceneId, authorId: live.bia.id });
  const drawing = insertable(square, ['id', 'drawOrder', 'createdAt']);
  await new DrawingsDao(live.connection.db).insertMany([drawing]);
  const cone = biaConePo({ sceneId, authorId: live.bia.id });
  const area = insertable(cone, ['id', 'areaOrder', 'createdAt']);
  await new EffectAreasDao(live.connection.db).insertMany([area]);
}

async function fight(sceneId: string, lyra: TokenRow): Promise<void> {
  const db = live.connection.db;
  const [combat] = await db.insert(combats).values({ sceneId, round: 2 }).returning();
  if (!combat) throw new Error('no combat row');
  const entry = { combatId: combat.id, initiative: 17, tieOrder: 0 };
  const [combatant] = await db.insert(combatants).values(entry).returning();
  if (!combatant) throw new Error('no combatant row');
  await db.insert(combatantTokens).values({ tokenId: lyra.token.id, combatantId: combatant.id });
}

describe('duplicating a grid of the library', () => {
  let salaoId: string;
  let lyra: TokenRow;
  let bram: TokenRow;

  beforeEach(async () => {
    salaoId = await groupSceneId();
    const url = `${libraryUrl()}/${salaoId}`;
    await live.http(live.ana, { method: 'PATCH', url, payload: { name: 'Salão do Sino' } });
    lyra = await placeLyra(salaoId);
    bram = await placeBram(salaoId);
    await furnish(salaoId);
    await fight(salaoId, lyra);
  });

  it('answers 201 with a private copy named "(cópia)" that counts its two tokens', async () => {
    const copy = await duplicated(salaoId);

    expect(copy).toMatchObject({
      name: 'Salão do Sino (cópia)',
      visibility: 'private',
      folderId: null,
      tokenCount: 2,
    });
    expect(copy.id).not.toBe(salaoId);
  });

  it('copies Lyra still of Bia, with her bars, her sight, her light and new ids', async () => {
    const copy = await duplicated(salaoId);

    const copied = await new TokensDao(live.connection.db).listOfScene(copy.id);
    const copiedLyra = copied.find(({ token }) => token.name === 'Lyra');
    expect(copied.map(({ token }) => token.name).sort()).toEqual(['Bram', 'Lyra']);
    expect(copied.map(({ token }) => token.id)).not.toContain(lyra.token.id);
    expect(copied.map(({ token }) => token.id)).not.toContain(bram.token.id);
    expect(copiedLyra?.controllerIds).toEqual([live.bia.id]);
    expect(copiedLyra?.bars.map(({ label, current, max }) => [label, current, max])).toEqual([
      ['PV', 32, 45],
      ['Inspiração', 1, 1],
    ]);
    expect(copiedLyra?.token).toMatchObject({
      sightBright: '18.00',
      sightDim: '36.00',
      lightColor: 'fire',
    });
    expect(copiedLyra?.bars.map(({ id }) => id)).not.toEqual(lyra.bars.map(({ id }) => id));
  });

  it('copies the Envenenado of Lyra with its 2 rounds, out of combat', async () => {
    const copy = await duplicated(salaoId);

    const copied = await new TokensDao(live.connection.db).listOfScene(copy.id);
    const tokenIds = copied.map(({ token }) => token.id);
    const conditions = await new ConditionsDao(live.connection.db).listOfTokens(tokenIds);
    expect(conditions.map(({ name, remainingRounds }) => [name, remainingRounds])).toEqual([
      ['Envenenado', 2],
    ]);
    const [saved] = await live.connection.db
      .select()
      .from(activeConditions)
      .where(inArray(activeConditions.tokenId, tokenIds));
    expect(saved?.appliedRound).toBeNull();
  });

  it('copies the three walls with the door still open, the unlit light, the drawing and the area', async () => {
    const copy = await duplicated(salaoId);

    const db = live.connection.db;
    const walls = await new WallsDao(db).listOfScene(copy.id);
    expect(walls.map(({ kind, doorState }) => [kind, doorState])).toEqual([
      ['wall', null],
      ['wall', null],
      ['door', 'open'],
    ]);
    expect((await new LightsDao(db).listOfScene(copy.id)).map(({ lit }) => lit)).toEqual([false]);
    const drawings = await new DrawingsDao(db).listOfScene(copy.id);
    expect(drawings.map(({ authorId }) => authorId)).toEqual([live.bia.id]);
    expect(await new EffectAreasDao(db).listOfScene(copy.id)).toEqual([
      expect.objectContaining({ kind: 'orthogonal_cone', authorId: live.bia.id }),
    ]);
  });

  it('leaves the combat behind', async () => {
    const copy = await duplicated(salaoId);

    const db = live.connection.db;
    expect(await db.select().from(combats).where(eq(combats.sceneId, copy.id))).toEqual([]);
  });

  it('leaves the original untouched: its tokens, its combat and the round of its condition', async () => {
    await duplicated(salaoId);

    const db = live.connection.db;
    const original = await new TokensDao(db).listOfScene(salaoId);
    expect(original.map(({ token }) => token.id).sort()).toEqual(
      [lyra.token.id, bram.token.id].sort(),
    );
    expect(await db.select().from(combats).where(eq(combats.sceneId, salaoId))).toHaveLength(1);
    const [condition] = await db
      .select()
      .from(activeConditions)
      .where(eq(activeConditions.tokenId, lyra.token.id));
    expect(condition?.appliedRound).toBe(1);
  });

  it('an empty grid duplicates into an empty copy', async () => {
    const response = await live.http(live.ana, {
      method: 'POST',
      url: libraryUrl(),
      payload: { name: 'Vazio' },
    });
    const empty = librarySceneDto.parse(response.json());

    const copy = await duplicated(empty.id);

    expect(copy).toMatchObject({ name: 'Vazio (cópia)', tokenCount: 0 });
  });

  it('Bia duplicating is 403 FORBIDDEN', async () => {
    const response = await duplicate(salaoId, live.bia);

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: 'FORBIDDEN' });
  });

  it('a grid of Quelm in the URL of Vharn is 404 SCENE_NOT_FOUND', async () => {
    const url = `/api/campaigns/${live.quelm.id}/scenes`;
    const quelm = libraryDto.parse((await live.http(live.caio, { method: 'GET', url })).json());

    const response = await duplicate(quelm.activeSceneId ?? 'none');

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: 'SCENE_NOT_FOUND' });
  });

  it('a restart of the app keeps the copy and its tokens', async () => {
    const copy = await duplicated(salaoId);

    await live.restart();

    const response = await live.http(live.ana, { method: 'GET', url: libraryUrl() });
    const library = libraryDto.parse(response.json());
    expect(library.scenes.find(({ id }) => id === copy.id)).toMatchObject({
      name: 'Salão do Sino (cópia)',
      tokenCount: 2,
    });
  });
});
