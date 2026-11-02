import {
  campaignResponseDto,
  libraryDto,
  sceneClosedDto,
  sessionJoinAckDto,
  sessionMemberJoinedDto,
  sessionMemberLeftDto,
  tokenUpdatedDto,
  type BoardStateDto,
  type SessionJoinAckDto,
  type TokenDto,
} from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import { activateGrid, gridAck, newGrid, setGridVisibility } from '../support/grids';
import { pngOf } from '../support/images';
import { envelope, eventPayload, send, synced } from '../support/live-table';
import { recordEventsOf, type RealtimeClient } from '../support/realtime-client';
import type { SignedInUser } from '../support/sign-in';
import type { Table } from '../support/tables';
import { tokenCommandFor, useTokenTable } from '../support/token-table';

const live = useTokenTable();

const DOOR = {
  kind: 'door',
  shape: 'line',
  x: 5,
  y: 3,
  width: 0,
  height: 3,
  points: [
    [0, 0],
    [0, 3],
  ],
} as const;
const TORCH = { x: 5.5, y: 3, bright: 4, dim: 4 } as const;
const CIRCLE = {
  kind: 'ellipse',
  x: 4,
  y: 4,
  width: 2,
  height: 2,
  fill: 'moss',
  stroke: 'gold',
  strokeWidth: 'medium',
};
const CONE = { kind: 'diagonal_cone', x: 6, y: 6, reach: 3, facing: 45, color: 'ember' } as const;

/** What every refused command of Duda names: real ids of Vharn, so only her role refuses it. */
type SpectatorTable = Readonly<{
  duda: SignedInUser;
  ana: RealtimeClient;
  spectator: RealtimeClient;
  lyra: TokenDto;
  kaelId: string;
  doorId: string;
  groupId: string;
  salaoId: string;
}>;

type Emit = (event: string, payload: object) => Promise<unknown>;

async function dudaJoins(table: Table = live.vharn): Promise<SignedInUser> {
  const duda = await live.signUp('Duda');
  await live.joinAsSpectator(duda, table);
  return duda;
}

function tokenNamed(state: BoardStateDto, name: string): TokenDto {
  const token = state.tokens.find((candidate) => candidate.name === name);
  if (!token) throw new Error(`no token ${name}; got ${state.tokens.map((t) => t.name).join()}`);
  return token;
}

function createdIdOf(ack: unknown): string {
  const [id] = (ack as { createdIds?: string[] }).createdIds ?? [];
  if (!id) throw new Error(`nothing created: ${JSON.stringify(ack)}`);
  return id;
}

// Lyra of Bia; Kael of Caio, with Duda put in its control by the master; a door; the public Salão.
async function spectatorTable(): Promise<SpectatorTable> {
  const duda = await dudaJoins();
  const ana = await live.atTable(live.ana, live.vharn);
  await send(ana, 'token:create', tokenCommandFor(live.vharn, live.bia.id));
  const kael = { name: 'Kael', initials: 'KA', col: 6, row: 6 };
  const controllerIds = [live.caio.id, duda.id];
  await send(
    ana,
    'token:create',
    tokenCommandFor(live.vharn, live.caio.id, { ...kael, controllerIds }),
  );
  const doorId = createdIdOf(
    await send(ana, 'wall:createMany', { ...envelope(live.vharn.id), walls: [DOOR] }),
  );
  const salaoId = await newGrid(live, live.ana, live.vharn, 'Salão');
  await setGridVisibility(live, live.ana, live.vharn, salaoId, 'public');
  const master = await synced(ana, live.vharn);
  const spectator = await live.atTable(duda, live.vharn);
  const lyra = tokenNamed(master, 'Lyra');
  const kaelId = tokenNamed(master, 'Kael').id;
  return { duda, ana, spectator, lyra, kaelId, doorId, groupId: master.scene.id, salaoId };
}

function libraryOf(user: SignedInUser): Promise<unknown> {
  const url = `/api/campaigns/${live.vharn.id}/scenes`;
  return live
    .http(user, { method: 'GET', url })
    .then((response) => libraryDto.parse(response.json()));
}

async function joinAck(client: RealtimeClient, table: Table): Promise<SessionJoinAckDto> {
  const timed = client.timeout(2000);
  const emit = timed.emitWithAck as Emit;
  return sessionJoinAckDto.parse(await emit.call(timed, 'session:join', envelope(table.id)));
}

describe('a spectator reads what a player reads', () => {
  it('GET of the table answers 200 with myRole spectator and no join code', async () => {
    const duda = await dudaJoins();

    const response = await live.http(duda, {
      method: 'GET',
      url: `/api/campaigns/${live.vharn.id}`,
    });

    expect(response.statusCode).toBe(200);
    const { campaign } = campaignResponseDto.parse(response.json());
    expect(campaign).toMatchObject({ myRole: 'spectator', joinCode: null });
  });

  it('entering the table answers 204', async () => {
    const duda = await dudaJoins();

    const url = `/api/campaigns/${live.vharn.id}/enter`;
    expect((await live.http(duda, { method: 'POST', url })).statusCode).toBe(204);
  });

  it('session:join is accepted with the snapshot of the table, Duda in it as a spectator', async () => {
    const duda = await dudaJoins();

    const ack = await joinAck(await live.connect(duda), live.vharn);

    expect(ack).toMatchObject({ ok: true });
    const members = ack.ok ? ack.state.members : [];
    expect(members.find(({ userId }) => userId === duda.id)).toMatchObject({ role: 'spectator' });
  });

  it('board:sync gives Duda the Lyra of Bia without the controllers bar and without control', async () => {
    const { spectator } = await spectatorTable();

    const state = await synced(spectator, live.vharn);

    const lyra = tokenNamed(state, 'Lyra');
    expect(lyra.canControl).toBe(false);
    expect(lyra.bars.map(({ label }) => label)).toEqual(['Inspiração']);
    expect(state.viewer.role).toBe('spectator');
  });

  it('Kael, with Duda put in its control by the master, still reaches her redacted', async () => {
    const { spectator } = await spectatorTable();

    const kael = tokenNamed(await synced(spectator, live.vharn), 'Kael');

    expect(kael.canControl).toBe(false);
    expect(kael.bars.map(({ label }) => label)).toEqual(['Inspiração']);
  });

  it('the library of Duda is the one of Bia: the private Torre stays out', async () => {
    const duda = await dudaJoins();
    await newGrid(live, live.ana, live.vharn, 'Torre');

    expect(await libraryOf(duda)).toEqual(await libraryOf(live.bia));
  });

  it('scene:watch of the public Salão is accepted', async () => {
    const { spectator, salaoId } = await spectatorTable();

    expect(await gridAck(spectator, 'scene:watch', live.vharn, salaoId)).toMatchObject({
      ok: true,
    });
  });

  it('an image of the table answers 200', async () => {
    const duda = await dudaJoins();
    const asset = await live.sendImage(live.ana, live.vharn);

    const response = await live.http(duda, { method: 'GET', url: `/api/assets/${asset.id}` });

    expect(response.statusCode).toBe(200);
  });
});

// Every write of each module once, with ids that exist: only the role of Duda refuses it.
const COMMANDS: Array<[string, (table: SpectatorTable) => object]> = [
  ['token:move', (t) => ({ ...envelope(live.vharn.id), tokenId: t.kaelId, col: 7, row: 7 })],
  [
    'token:dragMany',
    (t) => ({ ...envelope(live.vharn.id), drags: [{ tokenId: t.kaelId, cell: null }] }),
  ],
  [
    'token:adjustBar',
    (t) => ({
      ...envelope(live.vharn.id),
      tokenId: t.lyra.id,
      barId: t.lyra.bars[0]?.id ?? crypto.randomUUID(),
      change: { op: 'add', amount: -1 },
    }),
  ],
  ['drawing:createMany', () => ({ ...envelope(live.vharn.id), drawings: [CIRCLE] })],
  ['effectArea:createMany', () => ({ ...envelope(live.vharn.id), effectAreas: [CONE] })],
  ['wall:setDoor', (t) => ({ ...envelope(live.vharn.id), wallId: t.doorId, state: 'open' })],
  ['light:createMany', () => ({ ...envelope(live.vharn.id), lights: [TORCH] })],
  [
    'character:update',
    () => ({
      ...envelope(live.vharn.id),
      characterId: crypto.randomUUID(),
      changes: { armorClass: 12 },
    }),
  ],
  [
    'condition:apply',
    (t) => ({
      ...envelope(live.vharn.id),
      tokenId: t.kaelId,
      conditionId: crypto.randomUUID(),
      rounds: 1,
    }),
  ],
  ['combat:nextTurn', () => ({ ...envelope(live.vharn.id), fromCombatantId: crypto.randomUUID() })],
  ['board:ping', (t) => ({ ...envelope(live.vharn.id), sceneId: t.groupId, x: 1.5, y: 1.5 })],
  ['scene:activate', (t) => ({ ...envelope(live.vharn.id), sceneId: t.salaoId })],
];

describe('every write of a spectator is refused with FORBIDDEN', () => {
  it.each(COMMANDS)(
    '%s of Duda is FORBIDDEN and the grid keeps its version',
    async (event, payloadOf) => {
      const table = await spectatorTable();
      const before = await synced(table.ana, live.vharn);

      const ack = await send(table.spectator, event, payloadOf(table));

      expect(ack).toEqual({ ok: false, error: expect.objectContaining({ code: 'FORBIDDEN' }) });
      const after = await synced(table.ana, live.vharn);
      expect([after.version, after.scene.id]).toEqual([before.version, before.scene.id]);
    },
  );

  it('sending an image is 403 FORBIDDEN', async () => {
    const duda = await dudaJoins();

    const response = await live.http(duda, {
      method: 'POST',
      url: `/api/campaigns/${live.vharn.id}/assets?purpose=background`,
      headers: { 'content-type': 'image/png' },
      payload: await pngOf(40, 40),
    });

    expect([response.statusCode, response.json().code]).toEqual([403, 'FORBIDDEN']);
  });

  it('importing an image by link is 403 FORBIDDEN', async () => {
    const duda = await dudaJoins();

    const response = await live.http(duda, {
      method: 'POST',
      url: `/api/campaigns/${live.vharn.id}/assets/import`,
      payload: { url: 'https://example.com/mapa.png', purpose: 'background' },
    });

    expect([response.statusCode, response.json().code]).toEqual([403, 'FORBIDDEN']);
  });

  it('editing the table is 403 FORBIDDEN', async () => {
    const duda = await dudaJoins();

    const url = `/api/campaigns/${live.vharn.id}`;
    const response = await live.http(duda, { method: 'PATCH', url, payload: { name: 'Minha' } });

    expect([response.statusCode, response.json().code]).toEqual([403, 'FORBIDDEN']);
  });

  it('creating a grid is 403 FORBIDDEN', async () => {
    const duda = await dudaJoins();

    const url = `/api/campaigns/${live.vharn.id}/scenes`;
    const response = await live.http(duda, { method: 'POST', url, payload: { name: 'Cripta' } });

    expect([response.statusCode, response.json().code]).toEqual([403, 'FORBIDDEN']);
  });

  it('scene:watch of the private Torre is SCENE_NOT_FOUND', async () => {
    const torre = await newGrid(live, live.ana, live.vharn, 'Torre');
    const duda = await dudaJoins();
    const spectator = await live.atTable(duda, live.vharn);

    const ack = await gridAck(spectator, 'scene:watch', live.vharn, torre);

    expect(ack).toEqual({ ok: false, error: expect.objectContaining({ code: 'SCENE_NOT_FOUND' }) });
  });
});

describe('a spectator of Vharn at Quelm (critério 14)', () => {
  it('GET of Quelm is 404 CAMPAIGN_NOT_FOUND', async () => {
    const duda = await dudaJoins();

    const response = await live.http(duda, {
      method: 'GET',
      url: `/api/campaigns/${live.quelm.id}`,
    });

    expect([response.statusCode, response.json().code]).toEqual([404, 'CAMPAIGN_NOT_FOUND']);
  });

  it('session:join of Quelm is CAMPAIGN_NOT_FOUND', async () => {
    const duda = await dudaJoins();
    const ack = await joinAck(await live.connect(duda), live.quelm);

    expect(ack).toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'CAMPAIGN_NOT_FOUND' }),
    });
  });
});

describe('the live session of a spectator', () => {
  const labelsOf = (payload: unknown): string[] =>
    tokenUpdatedDto.parse(payload).token.bars.map(({ label }) => label);

  it('Duda joining makes Ana hear memberJoined with the spectator role', async () => {
    const duda = await dudaJoins();
    const ana = recordEventsOf(await live.atTable(live.ana, live.vharn));

    await live.atTable(duda, live.vharn);

    const joined = sessionMemberJoinedDto.parse(await eventPayload(ana, 'session:memberJoined'));
    expect(joined.member).toMatchObject({ userId: duda.id, role: 'spectator', online: true });
  });

  it('Duda leaving makes Ana hear memberLeft, and Caio joining later does not see her', async () => {
    const duda = await dudaJoins();
    const ana = recordEventsOf(await live.atTable(live.ana, live.vharn));
    const spectator = await live.atTable(duda, live.vharn);

    await spectator.timeout(2000).emitWithAck('session:leave', envelope(live.vharn.id));

    const left = sessionMemberLeftDto.parse(await eventPayload(ana, 'session:memberLeft'));
    expect(left.userId).toBe(duda.id);
    const ack = await joinAck(await live.connect(live.caio), live.vharn);
    const members = ack.ok ? ack.state.members.map(({ userId }) => userId) : [];
    expect(members).not.toContain(duda.id);
    expect(members).toContain(live.bia.id);
  });

  it('the master renaming Kael: Caio hears it whole, Duda, in its control, redacted', async () => {
    const table = await spectatorTable();
    const caio = recordEventsOf(await live.atTable(live.caio, live.vharn));
    const duda = recordEventsOf(table.spectator);
    const kael = tokenCommandFor(live.vharn, live.caio.id, {
      ...{ name: 'Kael, o Bravo', initials: 'KA' },
      controllerIds: [live.caio.id, table.duda.id],
    });
    // token:update takes every field of token:create but the cell.
    const fields = Object.fromEntries(
      Object.entries(kael).filter(([key]) => key !== 'col' && key !== 'row'),
    );

    await send(table.ana, 'token:update', {
      ...fields,
      ...envelope(live.vharn.id),
      tokenId: table.kaelId,
    });

    expect(labelsOf(await eventPayload(caio, 'token:updated'))).toEqual(['PV', 'Inspiração']);
    expect(labelsOf(await eventPayload(duda, 'token:updated'))).toEqual(['Inspiração']);
  });

  it('the master taking the group to the Salão: Duda hears it and then the Salão events', async () => {
    const table = await spectatorTable();
    const duda = recordEventsOf(table.spectator);

    await activateGrid(table.ana, live.vharn, table.salaoId);
    const on = { ...envelope(live.vharn.id), sceneId: table.salaoId };
    await send(table.ana, 'drawing:createMany', { ...on, drawings: [CIRCLE] });

    expect(await eventPayload(duda, 'scene:activated')).toMatchObject({ sceneId: table.salaoId });
    expect(await eventPayload(duda, 'drawing:createdMany')).toMatchObject({
      sceneId: table.salaoId,
    });
  });

  it('the master making private the Salão Duda opened as a tab closes it for her', async () => {
    const table = await spectatorTable();
    const duda = recordEventsOf(table.spectator);
    await gridAck(table.spectator, 'scene:watch', live.vharn, table.salaoId);

    await setGridVisibility(live, live.ana, live.vharn, table.salaoId, 'private');

    const closed = sceneClosedDto.parse(await eventPayload(duda, 'scene:closed'));
    expect(closed).toMatchObject({ sceneId: table.salaoId, reason: 'private' });
  });
});

describe('the table keeps no trace of a spectator', () => {
  it('the detail of Ana does not list Duda, even with her at the table', async () => {
    const duda = await dudaJoins();
    await live.atTable(duda, live.vharn);

    const response = await live.http(live.ana, {
      method: 'GET',
      url: `/api/campaigns/${live.vharn.id}`,
    });

    const { campaign } = campaignResponseDto.parse(response.json());
    expect(campaign.members.map(({ userId }) => userId)).not.toContain(duda.id);
    expect(campaign.memberCount).toBe(3);
  });
});
