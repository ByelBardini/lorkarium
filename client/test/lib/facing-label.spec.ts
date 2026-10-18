import { describe, expect, it } from 'vitest';
import { facingLabel } from '@/lib/facing-label';

describe('facingLabel', () => {
  it.each([
    [0, 'sul'],
    [22, 'sul'],
    [23, 'sudoeste'],
    [45, 'sudoeste'],
    [90, 'oeste'],
    [135, 'noroeste'],
    [180, 'norte'],
    [225, 'nordeste'],
    [270, 'leste'],
    [315, 'sudeste'],
    [340, 'sul'],
  ])('facing %s reads "%s"', (facing, label) => {
    expect(facingLabel(facing)).toBe(label);
  });
});
