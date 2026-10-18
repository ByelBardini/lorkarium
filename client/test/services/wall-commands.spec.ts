import { beforeEach, describe, expect, it } from 'vitest';
import { BoardCommandSender } from '@/services/board-command-sender';
import { RealtimeWallCommands, type WallShape } from '@/services/wall-commands';
import { VHARN } from '../support/campaigns-api-fake';
import { RealtimeTransportFake } from '../support/realtime-transport-fake';

const ACTION_ID = '0f8b5b8e-1c1f-4d7c-9a51-6b3c2d1e0f9a';
const WALL_ID = 'c3d4e5f6-a7b8-4c9d-8e0f-1a2b3c4d5e6f';
const LINE: WallShape = {
  kind: 'wall',
  shape: 'line',
  x: 2,
  y: 2,
  width: 4,
  height: 0,
  points: [
    [0, 0],
    [4, 0],
  ],
};
const BASE = { actionId: ACTION_ID, campaignId: VHARN.id };

describe('RealtimeWallCommands', () => {
  let transport: RealtimeTransportFake;
  let commands: RealtimeWallCommands;

  beforeEach(() => {
    transport = new RealtimeTransportFake();
    commands = new RealtimeWallCommands(new BoardCommandSender(transport, () => ACTION_ID));
  });

  it('createWalls sends wall:createMany and answers the new ids', async () => {
    const result = commands.createWalls(VHARN.id, [LINE]);
    expect(transport.sent).toEqual([
      { event: 'wall:createMany', payload: { ...BASE, walls: [LINE] } },
    ]);
    await transport.answerAck({ ok: true, version: 3, createdIds: [WALL_ID] }, 'wall:createMany');
    expect(await result).toEqual({ ok: true, version: 3, createdIds: [WALL_ID] });
  });

  it('eraseWallArea sends wall:eraseArea with the box and answers the ids left', async () => {
    const box = { x: 3, y: 1, width: 2, height: 2 };
    const result = commands.eraseWallArea(VHARN.id, box);
    expect(transport.sent).toEqual([{ event: 'wall:eraseArea', payload: { ...BASE, box } }]);
    await transport.answerAck({ ok: true, version: 3, createdIds: [WALL_ID] }, 'wall:eraseArea');
    expect(await result).toEqual({ ok: true, version: 3, createdIds: [WALL_ID] });
  });

  it('eraseWallSegment sends wall:eraseSegment with the piece and answers the ids left', async () => {
    const result = commands.eraseWallSegment(VHARN.id, WALL_ID, 2, { x: 2, y: 2 });
    expect(transport.sent).toEqual([
      {
        event: 'wall:eraseSegment',
        payload: { ...BASE, wallId: WALL_ID, segmentIndex: 2, expect: { x: 2, y: 2 } },
      },
    ]);
    await transport.answerAck({ ok: true, version: 3, createdIds: [WALL_ID] }, 'wall:eraseSegment');
    expect(await result).toEqual({ ok: true, version: 3, createdIds: [WALL_ID] });
  });

  it('deleteWalls sends the ids, with the positions they must still have when undoing', () => {
    void commands.deleteWalls(VHARN.id, [WALL_ID]);
    void commands.deleteWalls(VHARN.id, [WALL_ID], [{ wallId: WALL_ID, x: 2, y: 2 }]);
    expect(transport.sent).toEqual([
      { event: 'wall:deleteMany', payload: { ...BASE, wallIds: [WALL_ID] } },
      {
        event: 'wall:deleteMany',
        payload: { ...BASE, wallIds: [WALL_ID], expect: [{ wallId: WALL_ID, x: 2, y: 2 }] },
      },
    ]);
  });

  it('setWallKinds sends one kind for the walls, and the kinds they must still have when undoing', () => {
    void commands.setWallKinds(VHARN.id, [WALL_ID], 'grate');
    void commands.setWallKinds(VHARN.id, [WALL_ID], 'wall', [{ wallId: WALL_ID, kind: 'grate' }]);
    expect(transport.sent).toEqual([
      { event: 'wall:setKindMany', payload: { ...BASE, wallIds: [WALL_ID], kind: 'grate' } },
      {
        event: 'wall:setKindMany',
        payload: {
          ...BASE,
          wallIds: [WALL_ID],
          kind: 'wall',
          expect: [{ wallId: WALL_ID, kind: 'grate' }],
        },
      },
    ]);
  });

  it('setDoor sends wall:setDoor with the wall and the state', () => {
    void commands.setDoor(VHARN.id, WALL_ID, 'open');
    expect(transport.sent).toEqual([
      { event: 'wall:setDoor', payload: { ...BASE, wallId: WALL_ID, state: 'open' } },
    ]);
  });

  it.each([
    ['WALL_NOT_FOUND', 'wall_not_found'],
    ['WALL_LIMIT', 'wall_limit'],
    ['INVALID_DOOR', 'invalid_door'],
    ['DOOR_LOCKED', 'door_locked'],
    ['WALL_BLOCKED', 'wall_blocked'],
    ['WALL_SEGMENT_NOT_FOUND', 'wall_not_found'],
  ])('a refusal with %s is the %s failure', async (code, failure) => {
    const result = commands.setDoor(VHARN.id, WALL_ID, 'open');
    await transport.answerAck({ ok: false, error: { code, message: 'x' } }, 'wall:setDoor');
    expect(await result).toEqual({ ok: false, failure });
  });

  it('an ack that never comes in 5 s is offline', async () => {
    const result = commands.createWalls(VHARN.id, [LINE]);
    await transport.timeOutAck('wall:createMany');
    expect(await result).toEqual({ ok: false, failure: 'offline' });
  });
});
