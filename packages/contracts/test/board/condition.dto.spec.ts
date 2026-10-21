import { describe, expect, it } from 'vitest';
import {
  CONDITION_ROUNDS_MAX,
  applyConditionCommandDto,
  applyConditionsCommandDto,
  conditionsAppliedDto,
  defineConditionCommandDto,
  setConditionRoundsCommandDto,
} from '../../src/board/condition.dto';

const BASE = {
  actionId: '0f8b5b8e-1c1f-4d7c-9a51-6b3c2d1e0f9a',
  campaignId: '3b9c1a7e-5d2f-4e8a-b6c4-1f0e9d8c7b6a',
};
const TOKEN_ID = '5d4c3b2a-1f0e-4d9c-8b7a-6f5e4d3c2b1a';
const CONDITION_ID = 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f';
const KAEL_ID = '6e5d4c3b-2a1f-4e0d-9c8b-7a6f5e4d3c2b';

describe('defineConditionCommandDto', () => {
  it('a name padded with spaces is trimmed', () => {
    const parsed = defineConditionCommandDto.parse({
      ...BASE,
      name: '  Sangrando ',
      tone: 'harm',
      icon: 'skull',
    });
    expect(parsed.name).toBe('Sangrando');
  });

  it.each(['S', 'x'.repeat(32)])('a name of %s characters passes', (name) => {
    expect(
      defineConditionCommandDto.safeParse({ ...BASE, name, tone: 'harm', icon: 'skull' }).success,
    ).toBe(true);
  });

  it.each(['', '   ', 'x'.repeat(33)])('the name "%s" is refused', (name) => {
    expect(
      defineConditionCommandDto.safeParse({ ...BASE, name, tone: 'harm', icon: 'skull' }).success,
    ).toBe(false);
  });

  it('a tone other than benefit or harm is refused', () => {
    expect(
      defineConditionCommandDto.safeParse({ ...BASE, name: 'X', tone: 'meh', icon: 'skull' })
        .success,
    ).toBe(false);
  });

  it('an icon outside the closed list is refused', () => {
    const command = { ...BASE, name: 'X', tone: 'harm', icon: '<svg onload=x>' };
    expect(defineConditionCommandDto.safeParse(command).success).toBe(false);
  });

  it('a command without an icon is refused', () => {
    expect(defineConditionCommandDto.safeParse({ ...BASE, name: 'X', tone: 'harm' }).success).toBe(
      false,
    );
  });
});

describe('applyConditionCommandDto', () => {
  const apply = { ...BASE, tokenId: TOKEN_ID, conditionId: CONDITION_ID };

  it('0 rounds (no limit) is accepted', () => {
    expect(applyConditionCommandDto.parse({ ...apply, rounds: 0 }).rounds).toBe(0);
  });

  it(`${CONDITION_ROUNDS_MAX} rounds pass and one more is refused`, () => {
    expect(applyConditionCommandDto.safeParse({ ...apply, rounds: 99 }).success).toBe(true);
    expect(applyConditionCommandDto.safeParse({ ...apply, rounds: 100 }).success).toBe(false);
  });

  it.each([-1, 1.5])('%s rounds is refused', (rounds) => {
    expect(applyConditionCommandDto.safeParse({ ...apply, rounds }).success).toBe(false);
  });
});

describe('applyConditionsCommandDto', () => {
  const applyMany = { ...BASE, conditionId: CONDITION_ID, rounds: 2 };

  it('two distinct tokens pass', () => {
    const parsed = applyConditionsCommandDto.parse({ ...applyMany, tokenIds: [TOKEN_ID, KAEL_ID] });
    expect(parsed.tokenIds).toEqual([TOKEN_ID, KAEL_ID]);
  });

  it('no token at all is refused', () => {
    expect(applyConditionsCommandDto.safeParse({ ...applyMany, tokenIds: [] }).success).toBe(false);
  });

  it('the same token twice is refused, naming it', () => {
    const parsed = applyConditionsCommandDto.safeParse({
      ...applyMany,
      tokenIds: [TOKEN_ID, TOKEN_ID],
    });
    expect(parsed.error?.issues[0]?.message).toContain(TOKEN_ID);
  });

  it(`${CONDITION_ROUNDS_MAX + 1} rounds is refused`, () => {
    const tooLong = { ...applyMany, tokenIds: [TOKEN_ID], rounds: CONDITION_ROUNDS_MAX + 1 };
    expect(applyConditionsCommandDto.safeParse(tooLong).success).toBe(false);
  });
});

describe('conditionsAppliedDto', () => {
  it('carries the condition each token got, in one version', () => {
    const condition = {
      id: '7f6e5d4c-3b2a-4f1e-8d0c-9b8a7f6e5d4c',
      conditionId: CONDITION_ID,
      name: 'Caído',
      tone: 'harm',
      icon: 'arrow-down-to-line',
      remainingRounds: null,
    };
    const event = { campaignId: BASE.campaignId, version: 4, at: '2026-10-16T12:00:00.000Z' };
    const parsed = conditionsAppliedDto.parse({
      ...event,
      applied: [{ tokenId: TOKEN_ID, condition }],
    });
    expect(parsed.applied[0]?.condition.name).toBe('Caído');
  });
});

describe('setConditionRoundsCommandDto', () => {
  const command = { ...BASE, tokenId: TOKEN_ID, activeConditionId: CONDITION_ID };

  it.each([0, CONDITION_ROUNDS_MAX])('%i rounds are accepted', (rounds) => {
    expect(setConditionRoundsCommandDto.parse({ ...command, rounds }).rounds).toBe(rounds);
  });

  it.each([CONDITION_ROUNDS_MAX + 1, -1, 1.5])('%s rounds are refused', (rounds) => {
    expect(setConditionRoundsCommandDto.safeParse({ ...command, rounds }).success).toBe(false);
  });

  it('a forged userId is refused', () => {
    const forged = { ...command, rounds: 2, userId: KAEL_ID };

    expect(setConditionRoundsCommandDto.safeParse(forged).success).toBe(false);
  });

  it('an activeConditionId that is not a uuid is refused', () => {
    const result = setConditionRoundsCommandDto.safeParse({
      ...command,
      activeConditionId: 'envenenado',
      rounds: 2,
    });

    expect(result.success).toBe(false);
  });
});
