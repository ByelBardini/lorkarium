import { beforeEach, describe, expect, it } from 'vitest';
import { BoardCommandSender } from '@/services/board-command-sender';
import { RealtimeLightCommands, type LightPlacement } from '@/services/light-commands';
import { VHARN } from '../support/campaigns-api-fake';
import { CORRIDOR_TORCH_ID } from '../support/light-fixtures';
import { RealtimeTransportFake } from '../support/realtime-transport-fake';

const ACTION_ID = '0f8b5b8e-1c1f-4d7c-9a51-6b3c2d1e0f9a';
const TORCH: LightPlacement = { x: 5.5, y: 3, bright: 4, dim: 4, color: null };
const BASE = { actionId: ACTION_ID, campaignId: VHARN.id };

describe('RealtimeLightCommands', () => {
  let transport: RealtimeTransportFake;
  let commands: RealtimeLightCommands;

  beforeEach(() => {
    transport = new RealtimeTransportFake();
    commands = new RealtimeLightCommands(new BoardCommandSender(transport, () => ACTION_ID));
  });

  it('createLights sends light:createMany and answers the new ids', async () => {
    const result = commands.createLights(VHARN.id, [TORCH]);
    expect(transport.sent).toEqual([
      { event: 'light:createMany', payload: { ...BASE, lights: [TORCH] } },
    ]);
    await transport.answerAck(
      { ok: true, version: 3, createdIds: [CORRIDOR_TORCH_ID] },
      'light:createMany',
    );
    expect(await result).toEqual({ ok: true, version: 3, createdIds: [CORRIDOR_TORCH_ID] });
  });

  it('moveLights sends the points, with where each must still be only when undoing', () => {
    void commands.moveLights(VHARN.id, [{ lightId: CORRIDOR_TORCH_ID, x: 6, y: 3 }]);
    void commands.moveLights(VHARN.id, [
      { lightId: CORRIDOR_TORCH_ID, x: 5, y: 5, expect: { x: 6, y: 3 } },
    ]);
    expect(transport.sent).toEqual([
      {
        event: 'light:moveMany',
        payload: { ...BASE, moves: [{ lightId: CORRIDOR_TORCH_ID, x: 6, y: 3 }] },
      },
      {
        event: 'light:moveMany',
        payload: {
          ...BASE,
          moves: [{ lightId: CORRIDOR_TORCH_ID, x: 5, y: 5, expect: { x: 6, y: 3 } }],
        },
      },
    ]);
  });

  it('setLightRanges sends the ranges and no expect when none is given', () => {
    void commands.setLightRanges(VHARN.id, [{ lightId: CORRIDOR_TORCH_ID, bright: 6, dim: 6 }]);
    expect(transport.sent).toEqual([
      {
        event: 'light:setRangeMany',
        payload: { ...BASE, changes: [{ lightId: CORRIDOR_TORCH_ID, bright: 6, dim: 6 }] },
      },
    ]);
  });

  it('setLightColors sends light:setColorMany, with the expected color only when undoing', () => {
    void commands.setLightColors(VHARN.id, [{ lightId: CORRIDOR_TORCH_ID, color: 'fire' }]);
    void commands.setLightColors(VHARN.id, [
      { lightId: CORRIDOR_TORCH_ID, color: 'moon', expect: { color: null } },
    ]);
    expect(transport.sent).toEqual([
      {
        event: 'light:setColorMany',
        payload: { ...BASE, changes: [{ lightId: CORRIDOR_TORCH_ID, color: 'fire' }] },
      },
      {
        event: 'light:setColorMany',
        payload: {
          ...BASE,
          changes: [{ lightId: CORRIDOR_TORCH_ID, color: 'moon', expect: { color: null } }],
        },
      },
    ]);
  });

  it('a refused setLightColors answers the failure without throwing', async () => {
    const result = commands.setLightColors(VHARN.id, [{ lightId: CORRIDOR_TORCH_ID, color: null }]);
    await transport.answerAck(
      { ok: false, error: { code: 'STALE_UNDO', message: 'Stale undo' } },
      'light:setColorMany',
    );
    expect(await result).toEqual({ ok: false, failure: 'stale_undo' });
  });

  it('setLightsLit sends the ids and the switch', () => {
    void commands.setLightsLit(VHARN.id, [CORRIDOR_TORCH_ID], false);
    expect(transport.sent).toEqual([
      {
        event: 'light:setLitMany',
        payload: { ...BASE, lightIds: [CORRIDOR_TORCH_ID], lit: false },
      },
    ]);
  });

  it('deleteLights sends the ids, with the points they must still have when undoing', () => {
    void commands.deleteLights(VHARN.id, [CORRIDOR_TORCH_ID]);
    void commands.deleteLights(
      VHARN.id,
      [CORRIDOR_TORCH_ID],
      [{ lightId: CORRIDOR_TORCH_ID, x: 5, y: 5 }],
    );
    expect(transport.sent).toEqual([
      { event: 'light:deleteMany', payload: { ...BASE, lightIds: [CORRIDOR_TORCH_ID] } },
      {
        event: 'light:deleteMany',
        payload: {
          ...BASE,
          lightIds: [CORRIDOR_TORCH_ID],
          expect: [{ lightId: CORRIDOR_TORCH_ID, x: 5, y: 5 }],
        },
      },
    ]);
  });

  it('a LIGHT_LIMIT refusal answers light_limit', async () => {
    const result = commands.createLights(VHARN.id, [TORCH]);
    await transport.answerAck(
      { ok: false, error: { code: 'LIGHT_LIMIT', message: 'Too many lights in this scene' } },
      'light:createMany',
    );
    expect(await result).toEqual({ ok: false, failure: 'light_limit' });
  });

  it('a LIGHT_NOT_FOUND refusal answers light_not_found', async () => {
    const result = commands.setLightsLit(VHARN.id, [CORRIDOR_TORCH_ID], true);
    await transport.answerAck(
      { ok: false, error: { code: 'LIGHT_NOT_FOUND', message: 'Light not found' } },
      'light:setLitMany',
    );
    expect(await result).toEqual({ ok: false, failure: 'light_not_found' });
  });
});
