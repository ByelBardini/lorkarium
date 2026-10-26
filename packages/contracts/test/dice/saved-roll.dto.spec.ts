import { describe, expect, it } from 'vitest';
import {
  createSavedRollRequestDto,
  savedRollNameKey,
  updateSavedRollRequestDto,
} from '../../src/dice/saved-roll.dto';

const VHARN_ID = '3b1e9a52-6c4d-4f8a-9e2b-1a7c5d3f8e10';
const ATTACK = { label: null, expression: '1d20+5' };

function issuesOf(result: { success: boolean; error?: { issues: { message: string }[] } }) {
  return result.error?.issues.map((issue) => issue.message) ?? [];
}

describe('savedRollNameKey', () => {
  it('drops case, accents and outer spaces: " Bênção " and "bencao" are the same name', () => {
    expect(savedRollNameKey(' Bênção ')).toBe('bencao');
  });

  it('"Acerto" and "ACÉRTO" share the key', () => {
    expect(savedRollNameKey('ACÉRTO')).toBe(savedRollNameKey('Acerto'));
  });
});

describe('createSavedRollRequestDto', () => {
  it('trims the name and every expression', () => {
    const parsed = createSavedRollRequestDto.parse({
      name: '  Acerto ',
      parts: [{ label: '  Espada ', expression: ' 1d20+5 ' }],
    });

    expect(parsed).toEqual({ name: 'Acerto', parts: [{ label: 'Espada', expression: '1d20+5' }] });
  });

  it('a name of 40 characters and 10 parts are accepted', () => {
    const body = { name: 'x'.repeat(40), parts: Array.from({ length: 10 }, () => ATTACK) };

    expect(createSavedRollRequestDto.safeParse(body).success).toBe(true);
  });

  it.each(['', '  ', 'x'.repeat(41)])('the name %j is refused', (name) => {
    expect(createSavedRollRequestDto.safeParse({ name, parts: [ATTACK] }).success).toBe(false);
  });

  it('no part and 11 parts are refused', () => {
    const eleven = Array.from({ length: 11 }, () => ATTACK);

    expect(createSavedRollRequestDto.safeParse({ name: 'A', parts: [] }).success).toBe(false);
    expect(createSavedRollRequestDto.safeParse({ name: 'A', parts: eleven }).success).toBe(false);
  });

  it('a campaignId in the body is refused (strict: the table comes from the route)', () => {
    const body = { name: 'Acerto', parts: [ATTACK], campaignId: VHARN_ID };

    expect(createSavedRollRequestDto.safeParse(body).success).toBe(false);
  });
});

describe('updateSavedRollRequestDto', () => {
  it('an empty body is refused naming the keys it expects', () => {
    const result = updateSavedRollRequestDto.safeParse({});

    expect(issuesOf(result)).toEqual(['changes is empty; expected at least one of name, parts']);
  });

  it('only the parts are accepted', () => {
    expect(updateSavedRollRequestDto.parse({ parts: [ATTACK] })).toEqual({ parts: [ATTACK] });
  });

  it('a name of spaces is refused', () => {
    expect(updateSavedRollRequestDto.safeParse({ name: '  ' }).success).toBe(false);
  });

  it('a campaignId in the body is refused', () => {
    const body = { name: 'Acerto', campaignId: VHARN_ID };

    expect(updateSavedRollRequestDto.safeParse(body).success).toBe(false);
  });
});
