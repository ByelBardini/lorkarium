import { facingToward, facingVector, snapFacing } from '@lorkarium/game-core';
import type { BoardView } from './board-view';
import { FACING_SNAP_STEP, HANDLE_GAP, type FacingTarget } from './facing-handle';
import { LIGHT_ICON_REACH, type LightView } from './light-view';

/** A map light in a cone as a facing target: the stem leaves the edge of its icon toward where it
 *  points, Shift snaps to 45°, and turning it aims the spotlight.
 *
 *  Example: `lightAimTarget(spotlight).turned(90) // { kind: 'lightAimed', lightId, facing: 90 }` */
export function lightAimTarget(light: LightView): FacingTarget {
  const lightId = light.id;
  const center = { x: light.x, y: light.y };
  const ahead = facingVector(light.facing);
  const at = (distance: number) => ({
    x: center.x + ahead.x * distance,
    y: center.y + ahead.y * distance,
  });
  return {
    id: lightId,
    facing: light.facing,
    stem: { from: at(LIGHT_ICON_REACH), to: at(LIGHT_ICON_REACH + HANDLE_GAP) },
    facingAt: (pointer, current, snap) => {
      const toward = facingToward(center, pointer);
      if (toward === null) return current;
      return snap ? snapFacing(toward, FACING_SNAP_STEP) : toward;
    },
    previewed: (facing) => ({ kind: 'lightAimPreviewed', lightId, facing }),
    turned: (facing) => ({ kind: 'lightAimed', lightId, facing }),
  };
}

/** What shows the handle with the lights tool: the one light picked, when it shines in a cone (a
 *  light of 360° has nowhere to point).
 *
 *  Example: `lightAimTargetOf(view)?.stem.to` */
export function lightAimTargetOf(view: Pick<BoardView, 'lights' | 'tool'>): FacingTarget | null {
  if (view.tool !== 'lights') return null;
  const picked = view.lights.filter(({ selected }) => selected);
  const [only] = picked;
  return picked.length === 1 && only && only.angle < 360 ? lightAimTarget(only) : null;
}
