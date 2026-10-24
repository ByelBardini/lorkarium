import { beforeEach, describe, expect, it } from 'vitest';
import { RealtimeSceneActivation } from '@/services/scene-activation';
import { VHARN } from '../support/campaigns-api-fake';
import { RealtimeTransportFake } from '../support/realtime-transport-fake';
import { ESTRADA_SCENE } from '../support/scene-tab-fixtures';

const ACTION_ID = '0f8b5b8e-1c1f-4d7c-9a51-6b3c2d1e0f9a';
const EVENT = 'scene:activate';
const ESTRADA = { campaignId: VHARN.id, sceneId: ESTRADA_SCENE.id };

describe('RealtimeSceneActivation', () => {
  let transport: RealtimeTransportFake;
  let activation: RealtimeSceneActivation;

  beforeEach(() => {
    transport = new RealtimeTransportFake();
    activation = new RealtimeSceneActivation(transport, () => ACTION_ID);
  });

  it('"scene:activate" goes out with a new action id, the table and the grid', () => {
    void activation.activate(ESTRADA);
    expect(transport.sent).toEqual([
      { event: EVENT, payload: { actionId: ACTION_ID, ...ESTRADA } },
    ]);
  });

  it('a bare ok ack answers ok', async () => {
    const result = activation.activate(ESTRADA);
    await transport.answerAck({ ok: true }, EVENT);
    expect(await result).toEqual({ ok: true });
  });

  it('a refusal answers its failure by code', async () => {
    const result = activation.activate(ESTRADA);
    await transport.answerAck(
      { ok: false, error: { code: 'SCENE_NOT_FOUND', message: 'x' } },
      EVENT,
    );
    expect(await result).toEqual({ ok: false, failure: 'scene_not_found' });
  });

  it('no ack in time is offline', async () => {
    const result = activation.activate(ESTRADA);
    await transport.timeOutAck(EVENT);
    expect(await result).toEqual({ ok: false, failure: 'offline' });
  });

  it('an ack outside the DTO is unexpected', async () => {
    const result = activation.activate(ESTRADA);
    await transport.answerAck({ ok: true, version: 3 }, EVENT);
    expect(await result).toEqual({ ok: false, failure: 'unexpected' });
  });
});
