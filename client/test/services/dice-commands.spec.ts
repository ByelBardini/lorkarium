import { beforeEach, describe, expect, it } from 'vitest';
import { RealtimeDiceCommands, type DiceRollRequest } from '@/services/dice-commands';
import { VHARN } from '../support/campaigns-api-fake';
import { BIA_ROLL_ID } from '../support/dice-fixtures';
import { RealtimeTransportFake } from '../support/realtime-transport-fake';

const ACTION_ID = '0f8b5b8e-1c1f-4d7c-9a51-6b3c2d1e0f9a';
const EVENT = 'dice:roll';
const ACERTO: DiceRollRequest = {
  label: 'Acerto',
  parts: [{ label: null, expression: '1d20+5' }],
  visibility: 'public',
  aspect: 1.78,
};

function refusal(code: string, extra: object = {}) {
  return { ok: false, error: { code, message: `refused: ${code}`, ...extra } };
}

describe('RealtimeDiceCommands', () => {
  let transport: RealtimeTransportFake;
  let dice: RealtimeDiceCommands;

  beforeEach(() => {
    transport = new RealtimeTransportFake();
    dice = new RealtimeDiceCommands(transport, () => ACTION_ID);
  });

  it('"dice:roll" goes out with a new action id, the table and the roll as asked', () => {
    void dice.roll(VHARN.id, ACERTO);
    expect(transport.sent).toEqual([
      { event: EVENT, payload: { actionId: ACTION_ID, campaignId: VHARN.id, ...ACERTO } },
    ]);
  });

  it('an ok ack answers ok with the id of the roll', async () => {
    const result = dice.roll(VHARN.id, ACERTO);
    await transport.answerAck({ ok: true, rollId: BIA_ROLL_ID }, EVENT);
    expect(await result).toEqual({ ok: true, rollId: BIA_ROLL_ID });
  });

  it('INVALID_DICE_EXPRESSION answers invalid_expression with the server message', async () => {
    const result = dice.roll(VHARN.id, ACERTO);
    await transport.answerAck(refusal('INVALID_DICE_EXPRESSION'), EVENT);
    expect(await result).toEqual({
      ok: false,
      failure: { kind: 'invalid_expression', message: 'refused: INVALID_DICE_EXPRESSION' },
    });
  });

  it('RATE_LIMITED answers rate_limited with the seconds to wait', async () => {
    const result = dice.roll(VHARN.id, ACERTO);
    await transport.answerAck(refusal('RATE_LIMITED', { retryAfterSeconds: 3 }), EVENT);
    expect(await result).toEqual({
      ok: false,
      failure: { kind: 'rate_limited', retryAfterSeconds: 3 },
    });
  });

  it('RATE_LIMITED without the seconds waits 1 s', async () => {
    const result = dice.roll(VHARN.id, ACERTO);
    await transport.answerAck(refusal('RATE_LIMITED'), EVENT);
    expect(await result).toEqual({
      ok: false,
      failure: { kind: 'rate_limited', retryAfterSeconds: 1 },
    });
  });

  it.each([
    ['FORBIDDEN', 'forbidden'],
    ['CAMPAIGN_NOT_FOUND', 'not_found'],
    ['UNAUTHENTICATED', 'unauthenticated'],
    ['INVALID_BODY', 'invalid'],
    ['INTERNAL_ERROR', 'unexpected'],
  ])('a refusal with %s answers %s', async (code, kind) => {
    const result = dice.roll(VHARN.id, ACERTO);
    await transport.answerAck(refusal(code), EVENT);
    expect(await result).toEqual({ ok: false, failure: { kind } });
  });

  it('no ack in 5 s answers offline', async () => {
    const result = dice.roll(VHARN.id, ACERTO);
    await transport.timeOutAck(EVENT);
    expect(await result).toEqual({ ok: false, failure: { kind: 'offline' } });
  });

  it('an ack outside the DTO (no roll id) answers unexpected', async () => {
    const result = dice.roll(VHARN.id, ACERTO);
    await transport.answerAck({ ok: true }, EVENT);
    expect(await result).toEqual({ ok: false, failure: { kind: 'unexpected' } });
  });
});
