import type { LightPlacementDto } from '@lorkarium/contracts';
import type { LightPo } from '../../src/modules/lights/lights.po';
import { VHARN_SCENE_ID } from './scenes-factories';

export const CORRIDOR_TORCH_ID = 'c4d5e6f7-a8b9-4c0d-8e1f-2a3b4c5d6e7f';
export const BRAZIER_ID = 'd5e6f7a8-b9c0-4d1e-9f2a-3b4c5d6e7f80';

const CREATED = new Date('2026-10-18T12:00:00Z');

/** The lit torch of the VHARN corridor at (5, 5): bright 4, dim 4 (6 m + 6 m at 1.5 m).
 *
 *  Example: `corridorTorchPo({ lit: false })` */
export function corridorTorchPo(overrides: Partial<LightPo> = {}): LightPo {
  return {
    id: CORRIDOR_TORCH_ID,
    sceneId: VHARN_SCENE_ID,
    lightOrder: 1,
    x: '5.00',
    y: '5.00',
    bright: '4.00',
    dim: '4.00',
    lit: true,
    createdAt: CREATED,
    ...overrides,
  };
}

/** A torch as the master places it: (5.5, 3), bright 4, dim 4.
 *
 *  Example: `service.createMany(ANA_ID, VHARN_ID, { lights: [newTorch()] })` */
export function newTorch(overrides: Partial<LightPlacementDto> = {}): LightPlacementDto {
  return { x: 5.5, y: 3, bright: 4, dim: 4, ...overrides };
}
