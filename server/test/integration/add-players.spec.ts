import { addPlayersAckDto, tokensCreatedDto, type AddPlayersAckDto } from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import {
  castIdOf,
  gridState,
  linkToCard,
  lyraPoisonedAtVharn,
  tokenIn,
} from '../support/characters';
import { gridAck, newGrid, setGridVisibility } from '../support/grids';
import { envelope, eventPayload, send, synced } from '../support/live-table';
import { recordEventsOf, type RealtimeClient } from '../support/realtime-client';
import type { Table } from '../support/tables';
import { characterOfUser, lyraBarsOnBia, renameCharacter } from '../support/table-characters';
import { createdTokenOf, tokenCommandFor, useTokenTable } from '../support/token-table';

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

// Lyra (Bia) and Bram (Caio) linked to their cards on the Salão; the public Estrada open by all.
async function partyAndEstrada() {
  const table = await lyraPoisonedAtVharn(live);
  const { ana, bia, caio, lyra } = table;
  await linkToCard(ana, live.vharn, { tokenId: lyra.id, memberId: live.bia.id });
  const lyraCharacterId = await lyraBarsOnBia(live);
  const anaEvents = recordEventsOf(ana);
  await send(ana, 'token:create', { ...tokenCommandFor(live.vharn, live.caio.id), name: 'Bram' });
  const bram = await createdTokenOf(anaEvents);
  await linkToCard(ana, live.vharn, { tokenId: bram.id, memberId: live.caio.id });
  const caioCharacter = await characterOfUser(live, live.vharn, live.caio);
  await renameCharacter(live, caioCharacter.character.id, 'Bram');
  const estrada = await newGrid(live, live.ana, live.vharn, 'Estrada');
  await setGridVisibility(live, live.ana, live.vharn, estrada, 'public');
  for (const client of [ana, bia, caio]) await gridAck(client, 'scene:watch', live.vharn, estrada);
  return { ...table, estrada, lyraCharacterId };
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
    expect(forBia.tokens.every(({ anchorTokenId }) => anchorTokenId !== null)).toBe(true);
    const lyraForBia = forBia.tokens[0];
    const lyraForCaio = forCaio.tokens[0];
    expect(lyraForBia?.bars.map(({ label }) => label)).toEqual(['PV', 'Inspiração']);
    expect(lyraForCaio?.bars.map(({ label }) => label)).toEqual(['Inspiração']);
  });

  it('the Lyra on the Estrada wears her character (its PV) and the Envenenado of her anchor', async () => {
    const { ana, bia, estrada, lyraCharacterId } = await partyAndEstrada();
    const ack = await addPlayers(ana, live.vharn, estrada);
    const lyraId = ack.ok ? (ack.createdIds[0] ?? '') : '';

    const lyra = tokenIn(await gridState(bia, live.vharn, estrada), lyraId);

    expect(lyra.characterId).toBe(lyraCharacterId);
    expect(lyra.bars.map(({ current }) => current)).toEqual([32, 1]);
    expect(lyra.conditions.map(({ name }) => name)).toEqual(['Envenenado']);
    expect(lyra).toMatchObject({ layer: 'tokens', facing: 0, sight: null, light: null });
  });

  it('a second add passes over who is already there: zero created', async () => {
    const { ana, estrada } = await partyAndEstrada();
    await addPlayers(ana, live.vharn, estrada);

    const again = await addPlayers(ana, live.vharn, estrada);

    expect(again).toMatchObject({ ok: true, createdIds: [] });
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
