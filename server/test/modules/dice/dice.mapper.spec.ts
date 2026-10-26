import {
  diceRolledDto,
  diceRolledSecretlyDto,
  type DiceRollCommandDto,
} from '@lorkarium/contracts';
import {
  DICE_FRAME_MS,
  continueDiceRoll,
  startDiceRoll,
  type DiceRollResult,
} from '@lorkarium/game-core';
import { describe, expect, it } from 'vitest';
import {
  toDiceAppearanceDto,
  toDiceRolledDto,
  toDiceRolledSecretlyDto,
  type DiceRollOutcome,
} from '../../../src/modules/dice/dice.mapper';
import { BIA_ID, VHARN_ID } from '../../support/campaigns-factories';
import { RESTING_FRAMES } from '../../support/dice-fakes';

const ROLL_ID = '6a1d2c3b-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const AT = '2026-10-25T12:00:00.000Z';

const COMMAND: DiceRollCommandDto = {
  actionId: '0f8b5b8e-1c1f-4d7c-9a51-6b3c2d1e0f9a',
  campaignId: VHARN_ID,
  label: 'Ataque',
  parts: [
    { label: 'Acerto', expression: '1d20+5' },
    { label: null, expression: '1d7' },
  ],
  visibility: 'public',
  aspect: 2,
};

function resultOf(values: number[]): DiceRollResult {
  const step = continueDiceRoll(startDiceRoll(['1d20+5', '1d7']).state, values);
  if (step.kind !== 'done') throw new Error('expected the roll to be done');
  return step.result;
}

function outcome(): DiceRollOutcome {
  return {
    rollId: ROLL_ID,
    rollerId: BIA_ID,
    command: COMMAND,
    result: resultOf([17, 4]),
    appearance: { color: 'rose', textureId: null, numberColor: null },
    models: [
      { kind: 'd20', startMs: 0, settleMs: 1500, frames: RESTING_FRAMES, value: 17, rethrows: 1 },
    ],
    indices: [[[[0]], []], [[undefined]]],
    settlesInMs: 1500,
    at: AT,
  };
}

describe('toDiceRolledDto', () => {
  it('carries the parts with their labels, model only on the modeled die, and the throw', () => {
    const event = toDiceRolledDto(outcome());

    expect(event.parts).toEqual([
      {
        label: 'Acerto',
        expression: '1d20+5',
        total: 22,
        dice: [{ sides: 20, value: 17, status: 'kept', model: [0] }],
      },
      { label: null, expression: '1d7', total: 4, dice: [{ sides: 7, value: 4, status: 'kept' }] },
    ]);
    expect(event.throw).toEqual({
      aspect: 2,
      frameMs: DICE_FRAME_MS,
      models: [{ kind: 'd20', startMs: 0, settleMs: 1500, frames: [...RESTING_FRAMES] }],
    });
    expect(event).toMatchObject({ label: 'Ataque', total: 26, settlesInMs: 1500, at: AT });
    expect(diceRolledDto.safeParse(event).success).toBe(true);
  });

  it('without models the throw is null and no die has a model', () => {
    const event = toDiceRolledDto({ ...outcome(), models: [], indices: [] });

    expect(event.throw).toBeNull();
    expect(event.parts.flatMap((part) => part.dice).some((die) => 'model' in die)).toBe(false);
  });
});

describe('toDiceRolledSecretlyDto', () => {
  it('keeps only who rolled and when it shows: no total, label, parts nor throw', () => {
    const notice = toDiceRolledSecretlyDto(toDiceRolledDto(outcome()));

    expect(notice).toEqual({
      campaignId: VHARN_ID,
      rollId: ROLL_ID,
      rollerId: BIA_ID,
      settlesInMs: 1500,
      at: AT,
    });
    expect(diceRolledSecretlyDto.safeParse(notice).success).toBe(true);
  });
});

describe('toDiceAppearanceDto', () => {
  it('an account without a row gets its automatic color, no texture and no number color', () => {
    const appearance = toDiceAppearanceDto(BIA_ID, undefined);

    expect(appearance).toMatchObject({ textureId: null, numberColor: null });
    expect(typeof appearance.color).toBe('string');
  });
});
