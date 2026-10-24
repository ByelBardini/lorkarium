import { describe, expect, it } from 'vitest';
import { MEMBER_COLORS, memberColorOf } from '../src/member-color';

const ANA_ID = '7d0f8c39-2b8e-4f4e-9d1a-5c6b7a8e9f01';
const BIA_ID = '9c2f4e61-7a3b-4d5c-8e9f-0b1a2c3d4e5f';
const CAIO_ID = 'b4d6e8f0-1a2b-4c3d-8e5f-6a7b8c9d0e1f';

describe('memberColorOf', () => {
  // Hashes: Ana 2853121278 % 8 = 6, Bia 994212731 % 8 = 3, Caio 3116868313 % 8 = 1 — the same
  // index the client's ping color gave before the color became a choice.
  it.each([
    [ANA_ID, 'teal'],
    [BIA_ID, 'moss'],
    [CAIO_ID, 'steel'],
  ])('with no choice, id %s gets the color drawn from its hash, %s', (userId, expected) => {
    expect(memberColorOf(userId, null)).toBe(expected);
  });

  it('a chosen color wins over the drawn one', () => {
    expect(memberColorOf(ANA_ID, 'rose')).toBe('rose');
  });

  it('the palette has 8 names in the order gold, steel, ember, moss, violet, rose, teal, bone', () => {
    expect(MEMBER_COLORS).toEqual([
      'gold',
      'steel',
      'ember',
      'moss',
      'violet',
      'rose',
      'teal',
      'bone',
    ]);
  });
});
