import { describe, expect, it } from 'vitest';
import { diceSettled, sheetRollOf } from '@/sheet-sandbox/sheet-bridge-dice';
import { biaRollAck } from '../support/dice-fixtures';
import { InteractionClockFake } from '../support/interaction-clock-fake';

describe('sheetRollOf', () => {
  it('keeps the expression, the total and each die without its 3D model', () => {
    expect(sheetRollOf(biaRollAck())).toEqual({
      expression: '1d20+5',
      total: 22,
      dice: [{ sides: 20, value: 17, status: 'kept' }],
    });
  });

  it('keeps the success of a die counted against a target', () => {
    const part = {
      label: null,
      expression: '2d6>=5',
      total: 1,
      dice: [
        { sides: 6, value: 5, status: 'kept' as const, success: true, model: [0] },
        { sides: 6, value: 2, status: 'kept' as const, success: false, model: [1] },
      ],
    };
    expect(sheetRollOf(biaRollAck({ parts: [part], total: 1 })).dice).toEqual([
      { sides: 6, value: 5, status: 'kept', success: true },
      { sides: 6, value: 2, status: 'kept', success: false },
    ]);
  });

  it('a roll with no part is an error naming the roll', () => {
    const outcome = { ...biaRollAck(), parts: [] };
    expect(() => sheetRollOf(outcome)).toThrow(`roll ${outcome.rollId} has no part`);
  });
});

describe('diceSettled', () => {
  it('resolves only once the clock reaches the settle time', async () => {
    const clock = new InteractionClockFake();
    let done = false;
    void diceSettled(clock, 1200).then(() => (done = true));
    clock.advance(1199);
    await Promise.resolve();
    expect(done).toBe(false);
    clock.advance(1);
    await Promise.resolve();
    expect(done).toBe(true);
  });
});
