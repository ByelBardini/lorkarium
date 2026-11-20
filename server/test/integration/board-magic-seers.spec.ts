import {
  tokenUpdatedDto,
  tokensCreatedDto,
  tokensDeletedDto,
  type CombatDto,
} from '@lorkarium/contracts';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { ScenesDao } from '../../src/modules/scenes/scenes.dao';
import { TokensDao } from '../../src/modules/tokens/tokens.dao';
import { tokens as tokensTable } from '../../src/modules/tokens/tokens.po';
import { setAccountPlan } from '../support/account-plans';
import { linkToCharacter } from '../support/characters';
import { newGrid } from '../support/grids';
import { expectNoTrace, hiddenTable, namesOf, type HiddenTable } from '../support/hidden-tokens';
import { envelope, eventPayload, send, silence, synced } from '../support/live-table';
import { recordEventsOf, type EventRecorder } from '../support/realtime-client';
import { lyraBarsOnBia } from '../support/table-characters';
import { createdTokenOf, tokenCommandFor, useTokenTable } from '../support/token-table';

// The Lobo (Bia's) is hidden; the Kael (Caio's) sees it once its magic sight is on.
describe('who sees by magic sight over Socket.IO', () => {
  const live = useTokenTable();
  beforeEach(async () => {
    await setAccountPlan(live.connection.db, live.ana.id, 'amigo_do_dono');
  });

  const on = (payload: object): object => ({ ...envelope(live.vharn.id), ...payload });

  function kaelUpdate(table: HiddenTable, overrides: object): object {
    const fields = { name: 'Kael', initials: 'KA', side: 'ally', width: 1, height: 1 };
    const control = { controllerIds: [live.caio.id], bars: [] };
    return on({ tokenId: table.kaelId, ...fields, ...control, ...overrides });
  }

  async function seeingBySql(tokenId: string, magicSight: string | null): Promise<void> {
    await live.connection.db
      .update(tokensTable)
      .set({ magicSight })
      .where(eq(tokensTable.id, tokenId));
  }

  async function fresh(recorder: EventRecorder): Promise<EventRecorder> {
    await silence();
    return recordEventsOf(recorder.client);
  }

  async function sceneIdOf(): Promise<string> {
    const scene = await new ScenesDao(live.connection.db).findActiveOf(live.vharn.id);
    if (!scene) throw new Error(`table ${live.vharn.id} has no scene`);
    return scene.id;
  }

  it('Ana turns it on: Caio gets token:createdMany with the Lobo as others, one version before token:updated', async () => {
    const table = await hiddenTable(live);

    const ack = await send(table.ana.client, 'token:update', kaelUpdate(table, { magicSight: 6 }));

    const created = tokensCreatedDto.parse(await eventPayload(table.caio, 'token:createdMany'));
    const updated = tokenUpdatedDto.parse(await eventPayload(table.caio, 'token:updated'));
    expect(created.tokens.map(({ id, canControl }) => [id, canControl])).toEqual([
      [table.loboId, false],
    ]);
    expect([created.version, ack]).toEqual([
      updated.version - 1,
      { ok: true, version: updated.version },
    ]);
    await eventPayload(table.bia, 'token:updated');
    expect(namesOf(table.bia)).toEqual(['board:advanced', 'token:updated']);
    const board = await synced(table.caio.client, live.vharn);
    expect(board.tokens.find(({ id }) => id === table.loboId)?.canControl).toBe(false);
  });

  it('with the Kael seeing, Ana moving the Lobo reaches Caio as token:moved', async () => {
    const table = await hiddenTable(live);
    await seeingBySql(table.kaelId, '6.00');

    await send(table.ana.client, 'token:move', on({ tokenId: table.loboId, col: 1, row: 1 }));

    expect(await eventPayload(table.caio, 'token:moved')).toMatchObject({ tokenId: table.loboId });
  });

  it('turning it off: Caio gets token:deletedMany of the Lobo', async () => {
    const table = await hiddenTable(live);
    await send(table.ana.client, 'token:update', kaelUpdate(table, { magicSight: 6 }));
    const caio = await fresh(table.caio);

    await send(table.ana.client, 'token:update', kaelUpdate(table, { magicSight: null }));

    const deleted = tokensDeletedDto.parse(await eventPayload(caio, 'token:deletedMany'));
    expect(deleted.tokenIds).toEqual([table.loboId]);
    const board = await synced(caio.client, live.vharn);
    expect(board.tokens.map(({ id }) => id)).not.toContain(table.loboId);
  });

  it('Ana deleting the Kael: Caio loses the Lobo and gets its torch back before the Kael goes', async () => {
    const table = await hiddenTable(live);
    await seeingBySql(table.kaelId, '6.00');

    await send(table.ana.client, 'token:delete', on({ tokenId: table.kaelId }));

    await eventPayload(table.caio, 'token:deleted');
    expect(namesOf(table.caio)).toEqual([
      'token:deletedMany',
      'token:veiledLightsChanged',
      'token:deleted',
    ]);
    expect(await eventPayload(table.caio, 'token:veiledLightsChanged')).toMatchObject({
      lights: [{ x: 4, y: 5, bright: 4, dim: 4 }],
    });
  });

  it('Ana taking Caio out of the control of the Kael: Caio loses the Lobo', async () => {
    const table = await hiddenTable(live);
    await seeingBySql(table.kaelId, '6.00');

    await send(table.ana.client, 'token:update', kaelUpdate(table, { controllerIds: [] }));

    const deleted = tokensDeletedDto.parse(await eventPayload(table.caio, 'token:deletedMany'));
    expect(deleted.tokenIds).toEqual([table.loboId]);
  });

  it('a paste by Ana of a seer for Caio: Caio starts seeing the Lobo', async () => {
    const table = await hiddenTable(live);
    const copy = tokenCommandFor(live.vharn, live.caio.id, { magicSight: 6, col: 9 }) as Record<
      string,
      unknown
    >;
    delete copy.actionId;
    delete copy.campaignId;

    await send(table.ana.client, 'token:createMany', on({ tokens: [copy] }));

    const created = tokensCreatedDto.parse(await eventPayload(table.caio, 'token:createdMany'));
    expect(created.tokens.map(({ id }) => id)).toEqual([table.loboId]);
  });

  it('combat:start with the Lobo: Caio, seeing, gets its entry', async () => {
    const table = await hiddenTable(live);
    await seeingBySql(table.kaelId, '6.00');
    const entries = [
      { name: null, tokenIds: [table.kaelId], initiative: 20 },
      { name: null, tokenIds: [table.loboId], initiative: 10 },
    ];

    await send(table.ana.client, 'combat:start', on({ entries }));

    const started = (await eventPayload(table.caio, 'combat:started')) as { combat: CombatDto };
    expect(started.combat.combatants).toHaveLength(2);
  });

  it('token:dragMany of the Lobo by Bia reaches Caio, seeing', async () => {
    const table = await hiddenTable(live);
    await seeingBySql(table.kaelId, '6.00');
    const drags = [{ tokenId: table.loboId, cell: { col: 9, row: 2 } }];

    await send(table.bia.client, 'token:dragMany', on({ drags }));

    expect(await eventPayload(table.caio, 'token:draggedMany')).toMatchObject({ drags });
  });

  it('Duda, a spectator listed in the control of the seer Kael, never gets the Lobo', async () => {
    const table = await hiddenTable(live);
    const duda = await live.signUp('Duda');
    await live.joinAsSpectator(duda, live.vharn);
    await seeingBySql(table.kaelId, '6.00');
    await send(
      table.ana.client,
      'token:update',
      kaelUpdate(table, { controllerIds: [live.caio.id, duda.id], magicSight: 6 }),
    );
    const watching = recordEventsOf(await live.atTable(duda, live.vharn));

    const board = await synced(watching.client, live.vharn);
    await send(table.ana.client, 'token:move', on({ tokenId: table.loboId, col: 1, row: 1 }));
    await silence();

    expect(board.tokens.map(({ id }) => id)).not.toContain(table.loboId);
    expectNoTrace(watching, table.loboId);
  });

  it('magicSeersOfScene: the controllers of a seer of that scene only; a linked one by its character', async () => {
    const ana = await live.atTable(live.ana, live.vharn);
    const events = recordEventsOf(ana);
    await send(ana, 'token:create', tokenCommandFor(live.vharn, live.caio.id, { magicSight: 6 }));
    const mage = (await createdTokenOf(events)).id;
    const torre = await newGrid(live, live.ana, live.vharn, 'Torre');
    const dao = new TokensDao(live.connection.db);
    const look = { name: 'Vigia', initials: 'VI', side: 'enemy', width: 1, height: 1 } as const;
    await dao.insert({
      token: { sceneId: torre, ...look, col: 1, row: 1, magicSight: '3.00' },
      bars: [],
      controllerIds: [live.bia.id],
    });

    expect(await dao.magicSeersOfScene(await sceneIdOf())).toEqual([live.caio.id]);
    expect(await dao.magicSeersOfScene(torre)).toEqual([live.bia.id]);

    const characterId = await lyraBarsOnBia(live);
    await linkToCharacter(ana, live.vharn, { tokenId: mage, characterId });
    expect(await dao.magicSeersOfScene(await sceneIdOf())).toEqual([live.bia.id]);
  });
});
