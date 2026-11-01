import { tokenUpdatedDto } from '@lorkarium/contracts';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { CharactersDao } from '../../src/modules/characters/characters.dao';
import { toSeatedCharacterRow } from '../../src/modules/characters/characters.mapper';
import { activeConditions } from '../../src/modules/conditions/conditions.po';
import { tokenBars } from '../../src/modules/tokens/tokens.po';
import {
  gridState,
  linkToCard,
  linkToCharacter,
  lyraPoisonedAtVharn,
  poison,
  tokenIn,
  unlinkFromCharacter,
} from '../support/characters';
import { gridAck, newGrid } from '../support/grids';
import { envelope, eventPayload, send, synced } from '../support/live-table';
import { recordEventsOf } from '../support/realtime-client';
import { charactersSynced, lyraBarsOnBia, poisonCharacter } from '../support/table-characters';
import { createdTokenOf, tokenCommandFor, useTokenTable } from '../support/token-table';

const live = useTokenTable();

const labelsOf = (bars: readonly { label: string }[]): string[] => bars.map(({ label }) => label);

// Kael of Caio on the Salão (his own Vigor and Envenenado), and Bia's character turned Lyra.
async function kaelAndLyra() {
  const table = await lyraPoisonedAtVharn(live);
  const lyraCharacterId = await lyraBarsOnBia(live);
  const anaEvents = recordEventsOf(table.ana);
  const vigor = { label: 'Vigor', current: 5, max: 5, color: 'moss', visibility: 'everyone' };
  const kael = { ...tokenCommandFor(live.vharn, live.caio.id), name: 'Kael', bars: [vigor] };
  await send(table.ana, 'token:create', { ...kael, col: 8 });
  const kaelId = (await createdTokenOf(anaEvents)).id;
  return { ...table, kaelId, lyraCharacterId };
}

describe('linking a token to a character (token:linkToCharacter)', () => {
  it('Ana links Kael to Lyra: all three hear token:updated of Kael wearing her, Caio without the PV', async () => {
    const { ana, kaelId, lyraCharacterId } = await kaelAndLyra();
    const recorders = [
      ana,
      ...(await Promise.all([live.bia, live.caio].map((u) => live.atTable(u, live.vharn)))),
    ].map(recordEventsOf);

    const ack = await linkToCharacter(ana, live.vharn, {
      tokenId: kaelId,
      characterId: lyraCharacterId,
    });
    expect(ack).toMatchObject({ ok: true });

    const [forAna, forBia, forCaio] = await Promise.all(
      recorders.map(async (r) => tokenUpdatedDto.parse(await eventPayload(r, 'token:updated'))),
    );
    expect(forAna?.token).toMatchObject({
      ...{ id: kaelId, name: 'Lyra', characterId: lyraCharacterId },
      ...{ controllerIds: [live.bia.id], conditions: [] },
    });
    expect(ack.ok && ack.version).toBe(forAna?.version);
    expect(labelsOf(forBia!.token.bars)).toEqual(['PV', 'Inspiração']);
    expect(labelsOf(forCaio!.token.bars)).toEqual(['Inspiração']);
  });

  it("Kael's own Vigor and Envenenado are gone; the characters' version does not move", async () => {
    const { ana, kaelId, lyraCharacterId } = await kaelAndLyra();
    await poison(ana, live.vharn, kaelId);
    const before = await charactersSynced(ana, live.vharn);

    await linkToCharacter(ana, live.vharn, { tokenId: kaelId, characterId: lyraCharacterId });

    const linked = tokenIn(await synced(ana, live.vharn), kaelId);
    expect(labelsOf(linked.bars)).toEqual(['PV', 'Inspiração']);
    expect(linked.conditions).toEqual([]);
    expect((await charactersSynced(ana, live.vharn)).version).toBe(before.version);
    const { db } = live.connection;
    expect(await db.select().from(tokenBars).where(eq(tokenBars.tokenId, kaelId))).toEqual([]);
    const held = await db
      .select()
      .from(activeConditions)
      .where(eq(activeConditions.tokenId, kaelId));
    expect(held).toEqual([]);
  });

  it('a second token of Lyra in the grid, or a token already linked, is CHARACTER_ALREADY_PLACED', async () => {
    const { ana, lyra, kaelId, lyraCharacterId } = await kaelAndLyra();
    await linkToCharacter(ana, live.vharn, { tokenId: lyra.id, characterId: lyraCharacterId });

    const second = await linkToCharacter(ana, live.vharn, {
      ...{ tokenId: kaelId, characterId: lyraCharacterId },
    });
    const again = await linkToCharacter(ana, live.vharn, {
      ...{ tokenId: lyra.id, characterId: lyraCharacterId },
    });

    expect(second).toMatchObject({ ok: false, error: { code: 'CHARACTER_ALREADY_PLACED' } });
    expect(again).toMatchObject({ ok: false, error: { code: 'CHARACTER_ALREADY_PLACED' } });
    expect(tokenIn(await synced(ana, live.vharn), kaelId)).toMatchObject({
      characterId: null,
      name: 'Kael',
    });
  });

  it('the same character in another grid is fine: Lyra on the Estrada too', async () => {
    const { ana, lyra, lyraCharacterId } = await kaelAndLyra();
    await linkToCharacter(ana, live.vharn, { tokenId: lyra.id, characterId: lyraCharacterId });
    const estrada = await newGrid(live, live.ana, live.vharn, 'Estrada');
    await gridAck(ana, 'scene:watch', live.vharn, estrada);
    const anaEvents = recordEventsOf(ana);
    await send(ana, 'token:create', {
      ...tokenCommandFor(live.vharn, live.ana.id),
      sceneId: estrada,
    });
    const echo = (await createdTokenOf(anaEvents)).id;

    const ack = await linkToCharacter(ana, live.vharn, {
      ...{ sceneId: estrada, tokenId: echo, characterId: lyraCharacterId },
    });

    expect(ack).toMatchObject({ ok: true });
    expect(tokenIn(await gridState(ana, live.vharn, estrada), echo).characterId).toBe(
      lyraCharacterId,
    );
  });

  it('a character of Quelm is CHARACTER_NOT_FOUND; a token of Quelm is TOKEN_NOT_FOUND', async () => {
    const { ana, kaelId, lyraCharacterId } = await kaelAndLyra();
    const quelm = await new CharactersDao(live.connection.db).insert(
      toSeatedCharacterRow(live.quelm.id, live.caio.id, 'Gorm'),
    );
    const caioAtQuelm = await live.atTable(live.caio, live.quelm);
    const quelmEvents = recordEventsOf(caioAtQuelm);
    await send(caioAtQuelm, 'token:create', tokenCommandFor(live.quelm, live.caio.id));
    const quelmToken = (await createdTokenOf(quelmEvents)).id;

    const otherCharacter = await linkToCharacter(ana, live.vharn, {
      ...{ tokenId: kaelId, characterId: quelm.character.id },
    });
    const otherToken = await linkToCharacter(ana, live.vharn, {
      ...{ tokenId: quelmToken, characterId: lyraCharacterId },
    });

    expect(otherCharacter).toMatchObject({ ok: false, error: { code: 'CHARACTER_NOT_FOUND' } });
    expect(otherToken).toMatchObject({ ok: false, error: { code: 'TOKEN_NOT_FOUND' } });
  });

  it('Bia linking is FORBIDDEN; a forged userId is INVALID_BODY', async () => {
    const { ana, bia, kaelId, lyraCharacterId } = await kaelAndLyra();
    const link = { tokenId: kaelId, characterId: lyraCharacterId };

    expect(await linkToCharacter(bia, live.vharn, link)).toMatchObject({
      ok: false,
      error: { code: 'FORBIDDEN' },
    });
    const forged = await send(ana, 'token:linkToCharacter', {
      ...{ ...envelope(live.vharn.id), ...link, userId: live.ana.id },
    });
    expect(forged).toMatchObject({ ok: false, error: { code: 'INVALID_BODY' } });
  });

  it('the link survives a restart of the app', async () => {
    const { ana, kaelId, lyraCharacterId } = await kaelAndLyra();
    await linkToCharacter(ana, live.vharn, { tokenId: kaelId, characterId: lyraCharacterId });

    await live.restart();

    const bia = await live.atTable(live.bia, live.vharn);
    const after = tokenIn(await synced(bia, live.vharn), kaelId);
    expect(after).toMatchObject({ characterId: lyraCharacterId, name: 'Lyra' });
  });

  it("the old token:linkToCard still links to the character of the card's player", async () => {
    const { ana, kaelId, lyraCharacterId } = await kaelAndLyra();

    const ack = await linkToCard(ana, live.vharn, { tokenId: kaelId, memberId: live.bia.id });

    expect(ack).toMatchObject({ ok: true });
    expect(tokenIn(await synced(ana, live.vharn), kaelId)).toMatchObject({
      ...{ characterId: lyraCharacterId, anchorTokenId: null },
    });
  });
});

describe('unlinking a token from its character (token:unlinkFromCharacter)', () => {
  it('Kael keeps a copy of what he wore (bars with new ids, control, Envenenado); Lyra stays', async () => {
    const { ana, kaelId, lyraCharacterId } = await kaelAndLyra();
    await linkToCharacter(ana, live.vharn, { tokenId: kaelId, characterId: lyraCharacterId });
    await poisonCharacter(live, ana, lyraCharacterId);

    const ack = await unlinkFromCharacter(ana, live.vharn, { tokenId: kaelId });
    expect(ack).toMatchObject({ ok: true });

    const free = tokenIn(await synced(ana, live.vharn), kaelId);
    expect(free).toMatchObject({
      ...{ characterId: null, anchorTokenId: null, name: 'Lyra' },
      ...{ controllerIds: [live.bia.id] },
    });
    expect(free.bars.map(({ current }) => current)).toEqual([32, 1]);
    expect(free.conditions).toEqual([
      expect.objectContaining({ name: 'Envenenado', remainingRounds: 3 }),
    ]);
    const [lyra] = (await charactersSynced(ana, live.vharn)).characters.filter(
      ({ id }) => id === lyraCharacterId,
    );
    expect(lyra?.bars.map(({ current }) => current)).toEqual([32, 1]);
    const characterBarIds = new Set(lyra?.bars.map(({ id }) => id));
    expect(free.bars.some(({ id }) => characterBarIds.has(id))).toBe(false);
  });

  it('a copied PV goes its own way: a hit on Kael does not touch Lyra', async () => {
    const { ana, kaelId, lyraCharacterId } = await kaelAndLyra();
    await linkToCharacter(ana, live.vharn, { tokenId: kaelId, characterId: lyraCharacterId });
    await unlinkFromCharacter(ana, live.vharn, { tokenId: kaelId });
    const pv = tokenIn(await synced(ana, live.vharn), kaelId).bars[0];

    const hit = await send(ana, 'token:adjustBar', {
      ...{
        ...envelope(live.vharn.id),
        tokenId: kaelId,
        barId: pv?.id,
        change: { op: 'add', amount: -7 },
      },
    });
    expect(hit).toMatchObject({ ok: true });

    expect(tokenIn(await synced(ana, live.vharn), kaelId).bars[0]?.current).toBe(25);
    const [lyra] = (await charactersSynced(ana, live.vharn)).characters.filter(
      ({ id }) => id === lyraCharacterId,
    );
    expect(lyra?.bars[0]?.current).toBe(32);
  });

  it('a loose token is TOKEN_NOT_LINKED; Bia unlinking is FORBIDDEN', async () => {
    const { ana, bia, kaelId, lyra, lyraCharacterId } = await kaelAndLyra();
    await linkToCharacter(ana, live.vharn, { tokenId: lyra.id, characterId: lyraCharacterId });

    expect(await unlinkFromCharacter(ana, live.vharn, { tokenId: kaelId })).toMatchObject({
      ok: false,
      error: { code: 'TOKEN_NOT_LINKED' },
    });
    expect(await unlinkFromCharacter(bia, live.vharn, { tokenId: lyra.id })).toMatchObject({
      ok: false,
      error: { code: 'FORBIDDEN' },
    });
  });
});
