import type { EffectAreaShapeDto } from '@lorkarium/contracts';
import type { EffectAreaPo } from '../../src/modules/effect-areas/effect-areas.po';
import { BIA_ID } from './campaigns-factories';
import { VHARN_SCENE_ID } from './scenes-factories';

export const BIA_CONE_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';

const CREATED = new Date('2026-10-18T12:00:00Z');

/** Bia's orthogonal cone on the VHARN scene: from (5, 5.5), facing right, reach 3, ember.
 *
 *  Example: `biaConePo({ authorId: null })` */
export function biaConePo(overrides: Partial<EffectAreaPo> = {}): EffectAreaPo {
  return {
    id: BIA_CONE_ID,
    sceneId: VHARN_SCENE_ID,
    authorId: BIA_ID,
    areaOrder: 1,
    kind: 'orthogonal_cone',
    x: '5.00',
    y: '5.50',
    width: '0.00',
    height: '0.00',
    reach: '3.00',
    facing: 0,
    color: 'ember',
    createdAt: CREATED,
    ...overrides,
  };
}

/** Bia's cone as the client knows it (the shape of `biaConePo`). */
export const BIA_CONE_SHAPE = {
  kind: 'orthogonal_cone',
  x: 5,
  y: 5.5,
  reach: 3,
  facing: 0,
  color: 'ember',
} as const satisfies EffectAreaShapeDto;

/** A grid circle as its author sends it: centered on (4, 4), reach 2, violet.
 *
 *  Example: `service.createMany(BIA_ID, VHARN_ID, { effectAreas: [newCircle({ x: 30 })] })` */
export function newCircle(
  overrides: Partial<{ x: number; y: number; reach: number }> = {},
): EffectAreaShapeDto {
  return { kind: 'circle', x: 4, y: 4, reach: 2, color: 'violet', ...overrides };
}
