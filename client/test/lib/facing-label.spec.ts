import { describe, expect, it } from 'vitest';
import { facingLabel } from '@/lib/facing-label';

describe('facingLabel', () => {
  it.each([
    [0, 'leste'],
    [22, 'leste'],
    [23, 'sudeste'],
    [45, 'sudeste'],
    [90, 'sul'],
    [135, 'sudoeste'],
    [180, 'oeste'],
    [225, 'noroeste'],
    [270, 'norte'],
    [315, 'nordeste'],
    [340, 'leste'],
  ])('facing %s reads "%s"', (facing, label) => {
    expect(facingLabel(facing)).toBe(label);
  });
});
