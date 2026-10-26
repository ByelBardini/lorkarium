import { describe, expect, it } from 'vitest';
import {
  DICE_ASPECT_MAX,
  DICE_ASPECT_MIN,
  DICE_EXPRESSION_MAX_LENGTH,
  DICE_ROLL_LABEL_MAX_LENGTH,
  DICE_ROLL_PARTS_MAX,
  diceAppearanceDto,
  diceRollAckDto,
  diceRollCommandDto,
  diceRolledDto,
  diceRolledSecretlyDto,
  diceThrowDto,
} from '../../src/dice/dice.dto';

const ACTION_ID = '0f8b5b8e-1c1f-4d7c-9a51-6b3c2d1e0f9a';
const CAMPAIGN_ID = '3b9c1a7e-5d2f-4e8a-b6c4-1f0e9d8c7b6a';
const ROLL_ID = '5d4c3b2a-1f0e-4d9c-8b7a-6f5e4d3c2b1a';
const BIA_ID = '6e5d4c3b-2a1f-4e0d-9c8b-7a6f5e4d3c2b';
const AT = '2026-10-25T12:00:00.000Z';
const RESTING_POSE = [0, 1000, 0, 0, 0, 0, 32767];

const D20_PART = { label: null, expression: '1d20+5' };
const COMMAND = {
  actionId: ACTION_ID,
  campaignId: CAMPAIGN_ID,
  label: null,
  parts: [D20_PART],
  visibility: 'public',
  aspect: 1.78,
};

const D20_MODEL = { kind: 'd20', startMs: 0, settleMs: 1200, frames: RESTING_POSE };
const THROW = { aspect: 1.78, frameMs: 1000 / 30, models: [D20_MODEL] };
const APPEARANCE = { color: 'gold', textureId: null, numberColor: null };

function rolledEvent(overrides: Record<string, unknown> = {}) {
  return {
    campaignId: CAMPAIGN_ID,
    rollId: ROLL_ID,
    rollerId: BIA_ID,
    visibility: 'public',
    label: null,
    parts: [
      {
        ...D20_PART,
        total: 22,
        dice: [{ sides: 20, value: 17, status: 'kept', model: [0] }],
      },
    ],
    total: 22,
    appearance: APPEARANCE,
    throw: THROW,
    settlesInMs: 1200,
    at: AT,
    ...overrides,
  };
}

function eventWithDie(die: Record<string, unknown>, throwValue: unknown = THROW) {
  const part = { ...D20_PART, total: 1, dice: [die] };
  return rolledEvent({ parts: [part], throw: throwValue });
}

function messagesOf(result: { success: boolean; error?: { issues: { message: string }[] } }) {
  return result.error?.issues.map((issue) => issue.message) ?? [];
}

describe('diceRollCommandDto', () => {
  it('the roll label and each part expression come out trimmed', () => {
    const command = {
      ...COMMAND,
      label: '  Acerto ',
      parts: [{ label: null, expression: ' 1d20+5 ' }],
    };

    const parsed = diceRollCommandDto.parse(command);

    expect(parsed.label).toBe('Acerto');
    expect(parsed.parts).toEqual([{ label: null, expression: '1d20+5' }]);
  });

  it.each([
    ['the roll', (label: string) => ({ ...COMMAND, label })],
    ['a part', (label: string) => ({ ...COMMAND, parts: [{ ...D20_PART, label }] })],
  ])('a blank label on %s becomes null', (_where, commandWith) => {
    const parsed = diceRollCommandDto.parse(commandWith('   '));

    expect([parsed.label, parsed.parts[0]?.label]).toEqual([null, null]);
  });

  it('a label past the limit is refused', () => {
    const label = 'a'.repeat(DICE_ROLL_LABEL_MAX_LENGTH + 1);

    expect(diceRollCommandDto.safeParse({ ...COMMAND, label }).success).toBe(false);
  });

  it.each([DICE_ASPECT_MIN, DICE_ASPECT_MAX])('aspect %s (a limit) is accepted', (aspect) => {
    expect(diceRollCommandDto.safeParse({ ...COMMAND, aspect }).success).toBe(true);
  });

  it.each([0.4, 3.01, Number.NaN])('aspect %s is refused', (aspect) => {
    expect(diceRollCommandDto.safeParse({ ...COMMAND, aspect }).success).toBe(false);
  });

  it('ten parts are accepted', () => {
    const parts = Array.from({ length: DICE_ROLL_PARTS_MAX }, () => D20_PART);

    expect(diceRollCommandDto.safeParse({ ...COMMAND, parts }).success).toBe(true);
  });

  it.each([
    ['no part', 0],
    ['eleven parts', DICE_ROLL_PARTS_MAX + 1],
  ])('a roll with %s is refused', (_label, count) => {
    const parts = Array.from({ length: count }, () => D20_PART);

    expect(diceRollCommandDto.safeParse({ ...COMMAND, parts }).success).toBe(false);
  });

  it('an expression of exactly the maximum length is accepted', () => {
    const expression = `1d20${'+1'.repeat((DICE_EXPRESSION_MAX_LENGTH - 4) / 2)}`;
    const command = { ...COMMAND, parts: [{ label: null, expression }] };

    expect(expression).toHaveLength(DICE_EXPRESSION_MAX_LENGTH);
    expect(diceRollCommandDto.safeParse(command).success).toBe(true);
  });

  it.each([
    ['blank', '   '],
    ['one past the limit', '1'.repeat(DICE_EXPRESSION_MAX_LENGTH + 1)],
  ])('an expression that is %s is refused', (_label, expression) => {
    const command = { ...COMMAND, parts: [{ label: null, expression }] };

    expect(diceRollCommandDto.safeParse(command).success).toBe(false);
  });

  it('a forged userId is refused: who rolls comes from the connection', () => {
    expect(diceRollCommandDto.safeParse({ ...COMMAND, userId: BIA_ID }).success).toBe(false);
  });

  it('a visibility other than public or masters is refused', () => {
    const command = { ...COMMAND, visibility: 'blind' };

    expect(diceRollCommandDto.safeParse(command).success).toBe(false);
  });
});

describe('diceRollAckDto', () => {
  it('a success carries the roll id', () => {
    expect(diceRollAckDto.parse({ ok: true, rollId: ROLL_ID })).toEqual({
      ok: true,
      rollId: ROLL_ID,
    });
  });

  it('a success without the roll id is refused', () => {
    expect(diceRollAckDto.safeParse({ ok: true }).success).toBe(false);
  });
});

describe('diceAppearanceDto', () => {
  it('the number color comes out in lowercase', () => {
    const appearance = { ...APPEARANCE, numberColor: '#FFAA00' };

    expect(diceAppearanceDto.parse(appearance).numberColor).toBe('#ffaa00');
  });

  it('a short hex number color is refused citing #rrggbb', () => {
    const messages = messagesOf(
      diceAppearanceDto.safeParse({ ...APPEARANCE, numberColor: '#fff' }),
    );

    expect(messages).toEqual(['#fff: expected #rrggbb']);
  });
});

describe('diceThrowDto', () => {
  it('frames of whole poses are accepted', () => {
    const model = { ...D20_MODEL, frames: [...RESTING_POSE, ...RESTING_POSE] };

    expect(diceThrowDto.safeParse({ ...THROW, models: [model] }).success).toBe(true);
  });

  it('frames of 13 integers are refused citing the length and a multiple of 7', () => {
    const model = { ...D20_MODEL, frames: [...RESTING_POSE, 0, 0, 0, 0, 0, 0] };

    const messages = messagesOf(diceThrowDto.safeParse({ ...THROW, models: [model] }));

    expect(messages).toEqual([
      'dice frames have 13 integers; expected a multiple of 7, at least 7',
    ]);
  });

  it('a model without frames is refused', () => {
    const model = { ...D20_MODEL, frames: [] };

    expect(diceThrowDto.safeParse({ ...THROW, models: [model] }).success).toBe(false);
  });

  it.each([
    ['a position past ±32000', 0, 32001],
    ['a quaternion past ±32767', 6, 32768],
  ])('%s is refused citing the integer', (_label, slot, value) => {
    const frames = RESTING_POSE.map((integer, index) => (index === slot ? value : integer));

    const messages = messagesOf(
      diceThrowDto.safeParse({ ...THROW, models: [{ ...D20_MODEL, frames }] }),
    );

    expect(messages[0]).toContain(`dice frame integer ${slot} is ${value}`);
  });

  it('the extremes of position and quaternion are accepted', () => {
    const frames = [32000, -32000, 0, -32767, 0, 0, 32767];

    expect(diceThrowDto.safeParse({ ...THROW, models: [{ ...D20_MODEL, frames }] }).success).toBe(
      true,
    );
  });

  it('a model that settles before its launch is refused', () => {
    const model = { ...D20_MODEL, startMs: 1500, settleMs: 1200 };

    expect(diceThrowDto.safeParse({ ...THROW, models: [model] }).success).toBe(false);
  });

  it('the two dice of a d100 (tens and units) are accepted kinds', () => {
    const models = [
      { ...D20_MODEL, kind: 'd100tens' },
      { ...D20_MODEL, kind: 'd10' },
    ];

    expect(diceThrowDto.safeParse({ ...THROW, models }).success).toBe(true);
  });

  it('a kind without a 3D model (d7) is refused', () => {
    const model = { ...D20_MODEL, kind: 'd7' };

    expect(diceThrowDto.safeParse({ ...THROW, models: [model] }).success).toBe(false);
  });

  it.each([
    ['no model', []],
    ['21 models', Array.from({ length: 21 }, () => D20_MODEL)],
  ])('a throw with %s is refused', (_label, models) => {
    expect(diceThrowDto.safeParse({ ...THROW, models }).success).toBe(false);
  });

  it('a frame interval of zero is refused', () => {
    expect(diceThrowDto.safeParse({ ...THROW, frameMs: 0 }).success).toBe(false);
  });
});

describe('diceRolledDto', () => {
  it('a roll whose dice point at existing models is accepted', () => {
    expect(diceRolledDto.safeParse(rolledEvent()).success).toBe(true);
  });

  it('a d100 die points at its two models', () => {
    const models = [
      { ...D20_MODEL, kind: 'd100tens' },
      { ...D20_MODEL, kind: 'd10' },
    ];
    const die = { sides: 100, value: 95, status: 'kept', model: [0, 1] };

    expect(diceRolledDto.safeParse(eventWithDie(die, { ...THROW, models })).success).toBe(true);
  });

  it('a die pointing past the throw models is refused citing the index', () => {
    const die = { sides: 20, value: 1, status: 'kept', model: [1] };

    const messages = messagesOf(diceRolledDto.safeParse(eventWithDie(die)));

    expect(messages).toEqual(['die model 1 is invalid; expected an index below 1 throw models']);
  });

  it('a die with a model on a roll without a throw is refused', () => {
    const die = { sides: 20, value: 1, status: 'kept', model: [0] };

    expect(diceRolledDto.safeParse(eventWithDie(die, null)).success).toBe(false);
  });

  it('a roll of model-less dice (d7) without a throw is accepted', () => {
    const die = { sides: 7, value: 3, status: 'kept' };

    expect(diceRolledDto.safeParse(eventWithDie(die, null)).success).toBe(true);
  });

  it('a die value above its sides is refused citing both', () => {
    const die = { sides: 6, value: 7, status: 'kept' };

    const messages = messagesOf(diceRolledDto.safeParse(eventWithDie(die, null)));

    expect(messages).toEqual(['die value 7 is invalid; expected 1 to 6']);
  });

  it.each(['kept', 'dropped', 'exploded', 'rerolled'])(
    'the die status %s is accepted',
    (status) => {
      const die = { sides: 6, value: 3, status };

      expect(diceRolledDto.safeParse(eventWithDie(die, null)).success).toBe(true);
    },
  );

  it('an unknown die status is refused', () => {
    const die = { sides: 6, value: 3, status: 'lost' };

    expect(diceRolledDto.safeParse(eventWithDie(die, null)).success).toBe(false);
  });
});

describe('diceRolledSecretlyDto', () => {
  it('the notice carries only who rolled and when it settles', () => {
    const notice = {
      campaignId: CAMPAIGN_ID,
      rollId: ROLL_ID,
      rollerId: BIA_ID,
      settlesInMs: 800,
      at: AT,
    };

    expect(diceRolledSecretlyDto.parse(notice)).toEqual(notice);
  });

  it('a notice that leaks the total is refused', () => {
    const notice = {
      campaignId: CAMPAIGN_ID,
      rollId: ROLL_ID,
      rollerId: BIA_ID,
      settlesInMs: 800,
      at: AT,
      total: 22,
    };

    expect(diceRolledSecretlyDto.safeParse(notice).success).toBe(false);
  });
});
