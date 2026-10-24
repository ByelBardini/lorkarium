import { describe, expect, it } from 'vitest';
import { PING_COLORS, pingColorOf } from '@/lib/ping-color';

const ANA_ID = '7d0f8c39-2b8e-4f4e-9d1a-5c6b7a8e9f01';
const BIA_ID = '9c2f4e61-7a3b-4d5c-8e9f-0b1a2c3d4e5f';
const CAIO_ID = 'b4d6e8f0-1a2b-4c3d-8e5f-6a7b8c9d0e1f';

describe('pingColorOf', () => {
  it('the same person gets the same color on every call', () => {
    expect([pingColorOf(ANA_ID), pingColorOf(ANA_ID)]).toEqual([0x5cc8c0, 0x5cc8c0]);
  });

  // Hashes: Ana 2853121278 % 8 = 6, Bia 994212731 % 8 = 3, Caio 3116868313 % 8 = 1.
  it('Ana, Bia and Caio get teal, moss and steel', () => {
    expect([ANA_ID, BIA_ID, CAIO_ID].map(pingColorOf)).toEqual([0x5cc8c0, 0x8cc084, 0x6fa8dc]);
  });

  it.each(['', 'x', 'ab', '00000000-0000-4000-8000-000000000001'])(
    'id "%s" gets a color of the 8 in the palette',
    (id) => {
      expect(PING_COLORS).toContain(pingColorOf(id));
    },
  );

  it('the palette has 8 distinct colors', () => {
    expect(new Set(PING_COLORS).size).toBe(8);
  });
});
