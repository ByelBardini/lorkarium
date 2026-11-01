import { describe, expect, it } from 'vitest';
import { characterOfUser, characterUpdate, charactersSynced } from '../support/table-characters';
import { gridAck, newGrid, setGridVisibility } from '../support/grids';
import { envelope, eventPayload, send, silence, synced } from '../support/live-table';
import { recordEventsOf, type EventRecorder } from '../support/realtime-client';
import { createdTokenOf, tokenCommandFor, useTokenTable } from '../support/token-table';

const live = useTokenTable();

const WALL = {
  kind: 'wall',
  shape: 'line',
  x: 2,
  y: 2,
  width: 3,
  height: 0,
  points: [
    [0, 0],
    [3, 0],
  ],
} as const;
// Lyra stands at (3, 4), center (3.5, 4.5), and sees 4 cells; the door runs down x = 5.
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

const LAIR = { name: 'Covil', tokenIds: [], initiative: null };

const PIECE_EVENTS = [
  'wall:createdMany',
  'light:createdMany',
  'drawing:createdMany',
  'effectArea:createdMany',
  'combat:started',
];

function piecesOf(recorder: EventRecorder): string[] {
  return recorder.events.map(({ name }) => name).filter((name) => PIECE_EVENTS.includes(name));
}

function sceneIdOf(recorder: EventRecorder, name: string): unknown {
  const found = recorder.events.find((event) => event.name === name);
  return (found?.payload as { sceneId?: string } | undefined)?.sceneId;
}

// Every piece command once, on `sceneId` of Vharn, sent by Ana.
function pieceCommands(sceneId: string): Array<[string, object]> {
  const on = { ...envelope(live.vharn.id), sceneId };
  return [
    ['wall:createMany', { ...on, walls: [WALL] }],
    ['light:createMany', { ...on, lights: [TORCH] }],
    ['drawing:createMany', { ...on, drawings: [CIRCLE] }],
    ['effectArea:createMany', { ...on, effectAreas: [CONE] }],
    ['combat:start', { ...on, entries: [LAIR] }],
  ];
}

describe('walls, lights, drawings, areas, conditions and combat on a grid that is not the group one', () => {
  it('in the Torre Ana opened, her wall, light, drawing, area and combat carry the Torre and reach only her', async () => {
    const torre = await newGrid(live, live.ana, live.vharn, 'Torre');
    const ana = await live.atTable(live.ana, live.vharn);
    const [anaEvents, biaEvents, caioEvents] = [
      ana,
      await live.atTable(live.bia, live.vharn),
      await live.atTable(live.caio, live.vharn),
    ].map(recordEventsOf);
    await gridAck(ana, 'scene:watch', live.vharn, torre);

    const acks = [];
    for (const [event, payload] of pieceCommands(torre)) acks.push(await send(ana, event, payload));

    expect(acks.map((ack) => ack.ok && ack.version)).toEqual([1, 2, 3, 4, 5]);
    await anaEvents!.until(5);
    expect(piecesOf(anaEvents!)).toEqual(PIECE_EVENTS);
    expect(PIECE_EVENTS.map((name) => sceneIdOf(anaEvents!, name))).toEqual(
      PIECE_EVENTS.map(() => torre),
    );
    await silence();
    expect([piecesOf(biaEvents!), piecesOf(caioEvents!)]).toEqual([[], []]);
  });

  it('Bia opens the door of the public Torre seen by her Lyra there, and Ana hears it with the Torre', async () => {
    const torre = await newGrid(live, live.ana, live.vharn, 'Torre');
    await setGridVisibility(live, live.ana, live.vharn, torre, 'public');
    const ana = await live.atTable(live.ana, live.vharn);
    const bia = await live.atTable(live.bia, live.vharn);
    const anaEvents = recordEventsOf(ana);
    await gridAck(ana, 'scene:watch', live.vharn, torre);
    await gridAck(bia, 'scene:watch', live.vharn, torre);
    const on = { ...envelope(live.vharn.id), sceneId: torre };
    const sight = { bright: 4, dim: 0 };
    await send(ana, 'token:create', {
      ...tokenCommandFor(live.vharn, live.bia.id, { sight }),
      ...on,
    });
    await createdTokenOf(anaEvents);
    const wallAck = await send(ana, 'wall:createMany', { ...on, walls: [DOOR] });
    const [doorId] = (wallAck as { createdIds: string[] }).createdIds;

    const ack = await send(bia, 'wall:setDoor', { ...on, wallId: doorId, state: 'open' });

    expect(ack).toEqual({ ok: true, version: 3 });
    expect(await eventPayload(anaEvents, 'wall:doorChanged')).toMatchObject({
      sceneId: torre,
      wallId: doorId,
      doorState: 'open',
    });
  });

  it('the combat of the group grid and that of the Torre go apart, each in its own version', async () => {
    const torre = await newGrid(live, live.ana, live.vharn, 'Torre');
    const ana = await live.atTable(live.ana, live.vharn);
    const groupVersion = (await synced(ana, live.vharn)).version;

    const group = await send(ana, 'combat:start', { ...envelope(live.vharn.id), entries: [LAIR] });
    const inTorre = await send(ana, 'combat:start', {
      ...envelope(live.vharn.id),
      sceneId: torre,
      entries: [LAIR],
    });
    const ended = await send(ana, 'combat:end', { ...envelope(live.vharn.id), sceneId: torre });

    expect([group, inTorre, ended]).toEqual([
      { ok: true, version: groupVersion + 1 },
      { ok: true, version: 1 },
      { ok: true, version: 2 },
    ]);
    expect((await synced(ana, live.vharn)).combat).not.toBeNull();
  });

  it('condition:define and character:update naming the Torre ride the table stream: the group grid keeps its version', async () => {
    const torre = await newGrid(live, live.ana, live.vharn, 'Torre');
    const ana = await live.atTable(live.ana, live.vharn);
    const bia = await live.atTable(live.bia, live.vharn);
    const biaEvents = recordEventsOf(bia);
    const group = await synced(ana, live.vharn);
    const before = await charactersSynced(ana, live.vharn);
    const lyra = await characterOfUser(live, live.vharn, live.bia);

    const defined = await send(ana, 'condition:define', {
      ...envelope(live.vharn.id),
      sceneId: torre,
      name: 'Sangrando',
      tone: 'harm',
      icon: 'droplet',
    });
    const card = characterUpdate(live.vharn, lyra.character.id, { armorClass: 15 });
    const updated = await send(bia, 'character:update', card);

    expect([defined, updated]).toEqual([
      { ok: true, version: before.version + 1 },
      { ok: true, version: before.version + 2 },
    ]);
    const event = await eventPayload(biaEvents, 'condition:defined');
    expect(event).toMatchObject({ campaignId: live.vharn.id, version: before.version + 1 });
    expect(event).not.toHaveProperty('sceneId');
    expect(await eventPayload(biaEvents, 'character:changed')).toMatchObject({
      version: before.version + 2,
    });
    expect((await synced(ana, live.vharn)).version).toBe(group.version);
  });

  it("a sceneId of Quelm's grid at Vharn is SCENE_NOT_FOUND for every piece command", async () => {
    const quelmTorre = await newGrid(live, live.caio, live.quelm, 'Torre da Quelm');
    const ana = await live.atTable(live.ana, live.vharn);

    const acks = [];
    for (const [event, payload] of pieceCommands(quelmTorre))
      acks.push(await send(ana, event, payload));

    const refused = { ok: false, error: { code: 'SCENE_NOT_FOUND', message: 'Scene not found' } };
    expect(acks).toEqual(PIECE_EVENTS.map(() => refused));
  });

  it('Bia drawing in the private Torre is SCENE_NOT_FOUND, never FORBIDDEN', async () => {
    const torre = await newGrid(live, live.ana, live.vharn, 'Torre');
    const bia = await live.atTable(live.bia, live.vharn);

    const on = { ...envelope(live.vharn.id), sceneId: torre };
    const ack = await send(bia, 'drawing:createMany', { ...on, drawings: [CIRCLE] });

    expect(ack).toMatchObject({ ok: false, error: { code: 'SCENE_NOT_FOUND' } });
  });
});
