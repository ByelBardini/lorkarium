import { eq } from 'drizzle-orm';
import { addPlayersAckDto, tokensCreatedDto, type AddPlayersAckDto } from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import { characters } from '../../src/modules/characters/characters.po';
import { castIdOf, gridState, tokenIn } from '../support/characters';
import { gridAck, newGrid, setGridVisibility } from '../support/grids';
import { envelope, eventPayload, send, synced } from '../support/live-table';
import { recordEventsOf, type RealtimeClient } from '../support/realtime-client';
import type { Table } from '../support/tables';
import {
  characterOfUser,
  lyraBarsOnBia,
  poisonCharacter,
  renameCharacter,
} from '../support/table-characters';
import { useTokenTable } from '../support/token-table';

const live = useTokenTable();

type Emit = (event: string, payload: object) => Promise<unknown>;

async function addPlayers(
  client: RealtimeClient,
  table: Table,
  sceneId: string,
): Promise<AddPlayersAckDto> {
  const timed = client.timeout(2000);
  const emit = timed.emitWithAck as Emit;
  const payload = { ...envelope(table.id), sceneId, center: { col: 5, row: 5 } };
  return addPlayersAckDto.parse(await emit.call(timed, 'token:addPlayers', payload));
}

// Lyra (Bia, poisoned) and Bram (Caio, 2×2) are the players' characters; nothing is on the
// public Estrada, open by all.
async function partyAndEstrada() {
  const [ana, bia, caio] = await Promise.all(
    [live.ana, live.bia, live.caio].map((user) => live.atTable(user, live.vharn)),
  );
  if (!ana || !bia || !caio) throw new Error('the table did not seat Ana, Bia and Caio');
  const lyraCharacterId = await lyraBarsOnBia(live);
  await poisonCharacter(live, ana, lyraCharacterId);
  const bram = (await characterOfUser(live, live.vharn, live.caio)).character.id;
  await renameCharacter(live, bram, 'Bram');
  await live.connection.db
    .update(characters)
    .set({ width: 2, height: 2 })
    .where(eq(characters.id, bram));
  const estrada = await newGrid(live, live.ana, live.vharn, 'Estrada');
  await setGridVisibility(live, live.ana, live.vharn, estrada, 'public');
  for (const client of [ana, bia, caio]) await gridAck(client, 'scene:watch', live.vharn, estrada);
  return { ana, bia, caio, estrada, lyraCharacterId, bram };
}

describe('"Adicionar jogadores" (token:addPlayers)', () => {
  it('Ana adds the party to the Estrada: Bia and Caio get one token:createdMany with Lyra and Bram linked', async () => {
    const { ana, bia, caio, estrada } = await partyAndEstrada();
    const [biaEvents, caioEvents] = [recordEventsOf(bia), recordEventsOf(caio)];

    const ack = await addPlayers(ana, live.vharn, estrada);
    expect(ack).toMatchObject({ ok: true, skippedMemberIds: [] });
    expect(ack.ok && ack.createdIds).toHaveLength(2);

    const forBia = tokensCreatedDto.parse(await eventPayload(biaEvents, 'token:createdMany'));
    const forCaio = tokensCreatedDto.parse(await eventPayload(caioEvents, 'token:createdMany'));
    expect(forBia.sceneId).toBe(estrada);
    expect(forBia.tokens.map(({ name }) => name)).toEqual(['Lyra', 'Bram']);
    expect(forBia.tokens.every(({ anchorTokenId }) => anchorTokenId === null)).toBe(true);
    expect(forBia.tokens.map(({ width }) => width)).toEqual([1, 2]);
    const lyraForBia = forBia.tokens[0];
    const lyraForCaio = forCaio.tokens[0];
    expect(lyraForBia?.bars.map(({ label }) => label)).toEqual(['PV', 'Inspiração']);
    expect(lyraForCaio?.bars.map(({ label }) => label)).toEqual(['Inspiração']);
  });

  it('the Lyra on the Estrada wears her character: its PV and its Envenenado', async () => {
    const { ana, bia, estrada, lyraCharacterId } = await partyAndEstrada();
    const ack = await addPlayers(ana, live.vharn, estrada);
    const lyraId = ack.ok ? (ack.createdIds[0] ?? '') : '';

    const lyra = tokenIn(await gridState(bia, live.vharn, estrada), lyraId);

    expect(lyra.characterId).toBe(lyraCharacterId);
    expect(lyra.bars.map(({ current }) => current)).toEqual([32, 1]);
    expect(lyra.conditions.map(({ name }) => name)).toEqual(['Envenenado']);
    expect(lyra).toMatchObject({ layer: 'tokens', facing: 0, sight: null, light: null });
  });

  it('a second add passes over who is already there: zero created, the version unmoved', async () => {
    const { ana, estrada } = await partyAndEstrada();
    const first = await addPlayers(ana, live.vharn, estrada);

    const again = await addPlayers(ana, live.vharn, estrada);

    expect(again).toMatchObject({ ok: true, createdIds: [], skippedMemberIds: [] });
    expect(again.ok && again.version).toBe(first.ok && first.version);
  });

  it('with Bram still on the grid and Lyra gone, a new add puts back only Lyra', async () => {
    const { ana, estrada, lyraCharacterId } = await partyAndEstrada();
    const first = await addPlayers(ana, live.vharn, estrada);
    const lyraId = first.ok ? (first.createdIds[0] ?? '') : '';
    const removal = { ...envelope(live.vharn.id), sceneId: estrada, tokenId: lyraId };
    expect(await send(ana, 'token:delete', removal)).toMatchObject({ ok: true });

    const again = await addPlayers(ana, live.vharn, estrada);

    const createdIds = again.ok ? again.createdIds : [];
    expect(createdIds).toHaveLength(1);
    const back = tokenIn(await gridState(ana, live.vharn, estrada), createdIds[0] ?? '');
    expect(back.characterId).toBe(lyraCharacterId);
  });

  it('Bia is FORBIDDEN; a grid of Quelm and the cast are SCENE_NOT_FOUND', async () => {
    const { ana, bia, estrada } = await partyAndEstrada();
    const caioAtQuelm = await live.atTable(live.caio, live.quelm);
    const quelmGrid = (await synced(caioAtQuelm, live.quelm)).scene.id;
    const castId = await castIdOf(live, live.ana, live.vharn);

    expect(await addPlayers(bia, live.vharn, estrada)).toMatchObject({
      ok: false,
      error: { code: 'FORBIDDEN' },
    });
    for (const sceneId of [quelmGrid, castId]) {
      expect(await addPlayers(ana, live.vharn, sceneId)).toMatchObject({
        ok: false,
        error: { code: 'SCENE_NOT_FOUND' },
      });
    }
  });
});
