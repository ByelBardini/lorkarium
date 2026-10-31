import { diceBoxOf, type Vector3 } from '@lorkarium/game-core';
import { fitDiceBox, type ViewportSize } from './box-fit';

/** Above the room panel and the settings pages over the room (`z-30`), below every dialog,
 *  sheet, popover and menu (`z-50`). */
export const DICE_OVERLAY_Z_INDEX = 40;

/** CSS pixels per die unit when the roller's box is fitted whole in this window (contain).
 *
 *  Example: `diceStageScaleOf(16 / 9, { width: 1920, height: 1080 }) // 67.5` */
export function diceStageScaleOf(aspect: number, viewport: ViewportSize): number {
  const rect = fitDiceBox(aspect, viewport);
  return rect.width / (2 * diceBoxOf(aspect).halfWidth);
}

/** The right-hand axis of a number printed on a face: `up × normal`, so (right, up, normal)
 *  is the frame of a plane whose +z faces out and whose text reads upright.
 *
 *  Example: `labelRightOf({ x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 }) // { x: 1, y: 0, z: 0 }` */
export function labelRightOf(up: Vector3, normal: Vector3): Vector3 {
  return {
    x: up.y * normal.z - up.z * normal.y,
    y: up.z * normal.x - up.x * normal.z,
    z: up.x * normal.y - up.y * normal.x,
  };
}
