import type { LightDto } from '@lorkarium/contracts';

export const CORRIDOR_TORCH_ID = 'f6a7b8c9-d0e1-4f2a-9b3c-4d5e6f7a8b9c';
export const BRAZIER_ID = 'a7b8c9d0-e1f2-4a3b-8c4d-5e6f7a8b9c0d';

/** The lit neutral torch of the VHARN corridor at (5, 5): bright 4, dim 4 (6 m + 6 m at 1.5 m).
 *
 *  Example: `vharnBoard({ lights: [corridorTorch({ lit: false })] })` */
export function corridorTorch(overrides: Partial<LightDto> = {}): LightDto {
  return {
    id: CORRIDOR_TORCH_ID,
    x: 5,
    y: 5,
    bright: 4,
    dim: 4,
    lit: true,
    color: null,
    facing: 0,
    angle: 360,
    ...overrides,
  };
}

/** A lit brazier at (12, 8): bright 2, dim 6.
 *
 *  Example: `vharnBoard({ lights: [corridorTorch(), brazier()] })` */
export function brazier(overrides: Partial<LightDto> = {}): LightDto {
  return corridorTorch({ id: BRAZIER_ID, x: 12, y: 8, bright: 2, dim: 6, ...overrides });
}
