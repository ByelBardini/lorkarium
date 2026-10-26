import { unitQuaternion, type Quaternion } from './dice-rest';
import type { Vector3 } from './dice-shapes';

/** One recorded instant of a die: center in box units (the die's circumradius is 1) and rotation. */
export interface DicePose {
  readonly position: Vector3;
  readonly quaternion: Quaternion;
}

/** Physics steps at 60 Hz and keeps one pose every other step: 30 frames per second. */
export const DICE_FRAMES_PER_SECOND = 30;
export const DICE_FRAME_MS = 1000 / DICE_FRAMES_PER_SECOND;
/** Integers per pose on the wire: x, y, z, qx, qy, qz, qw. */
export const DICE_POSE_STRIDE = 7;
/** The farthest a die center may go from the box origin on each axis, in box units. */
export const DICE_POSITION_LIMIT = 32;
/** Position integers are thousandths of a box unit (32 → 32000, inside 16 bits). */
export const DICE_POSITION_SCALE = 1000;
/** Quaternion components are stored × 32767 (an int16 snorm). */
export const DICE_QUATERNION_SCALE = 32767;

const AXES = ['x', 'y', 'z'] as const;

function positionIntegers(pose: DicePose, index: number): number[] {
  return AXES.map((axis) => {
    const value = pose.position[axis];
    if (!(Math.abs(value) <= DICE_POSITION_LIMIT)) {
      throw new RangeError(
        `Dice pose ${index} position ${axis} ${value} is outside the box: expected −${DICE_POSITION_LIMIT} to ${DICE_POSITION_LIMIT}.`,
      );
    }
    return Math.round(value * DICE_POSITION_SCALE);
  });
}

function quaternionIntegers(quaternion: Quaternion): number[] {
  const { x, y, z, w } = unitQuaternion(quaternion);
  return [x, y, z, w].map((component) => Math.round(component * DICE_QUATERNION_SCALE));
}

/** The poses of one die packed as integers, 7 per pose, for the throw event.
 *
 *  Example: `encodeDiceFrames([{ position: { x: 1.5, y: 0, z: 0 }, quaternion: IDENTITY_QUATERNION }]) // [1500, 0, 0, 0, 0, 0, 32767]` */
export function encodeDiceFrames(poses: readonly DicePose[]): number[] {
  return poses.flatMap((pose, index) => [
    ...positionIntegers(pose, index),
    ...quaternionIntegers(pose.quaternion),
  ]);
}

function assertWholeFrames(frames: readonly number[]): void {
  if (frames.length % DICE_POSE_STRIDE !== 0) {
    throw new RangeError(
      `Dice frames have ${frames.length} integers: expected a multiple of ${DICE_POSE_STRIDE}.`,
    );
  }
  const fractional = frames.findIndex((value) => !Number.isInteger(value));
  if (fractional >= 0) {
    throw new RangeError(
      `Dice frame integer ${fractional} is ${frames[fractional]}: expected a whole number.`,
    );
  }
}

function normalizedQuaternion(x: number, y: number, z: number, w: number): Quaternion {
  const norm = Math.hypot(x, y, z, w);
  if (norm === 0) {
    throw new RangeError(
      `Quaternion norm 0 is invalid: expected a unit quaternion, got (${x}, ${y}, ${z}, ${w}).`,
    );
  }
  return { x: x / norm, y: y / norm, z: z / norm, w: w / norm };
}

function poseFromIntegers(slice: readonly number[]): DicePose {
  const [x = 0, y = 0, z = 0, qx = 0, qy = 0, qz = 0, qw = 0] = slice;
  return {
    position: {
      x: x / DICE_POSITION_SCALE,
      y: y / DICE_POSITION_SCALE,
      z: z / DICE_POSITION_SCALE,
    },
    quaternion: normalizedQuaternion(qx, qy, qz, qw),
  };
}

/** The poses back from the integers of `encodeDiceFrames`, quaternions renormalized.
 *
 *  Example: `decodeDiceFrames([1500, 0, 0, 0, 0, 0, 32767])[0].position.x // 1.5` */
export function decodeDiceFrames(frames: readonly number[]): DicePose[] {
  assertWholeFrames(frames);
  return Array.from({ length: frames.length / DICE_POSE_STRIDE }, (_, index) =>
    poseFromIntegers(frames.slice(index * DICE_POSE_STRIDE, (index + 1) * DICE_POSE_STRIDE)),
  );
}

function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}

/** Spherical interpolation along the shorter arc (flips `to` when the dot is negative). */
function slerpQuaternion(from: Quaternion, to: Quaternion, t: number): Quaternion {
  const rawDot = from.x * to.x + from.y * to.y + from.z * to.z + from.w * to.w;
  const sign = rawDot < 0 ? -1 : 1;
  const cosine = Math.min(1, rawDot * sign);
  const angle = Math.acos(cosine);
  const sine = Math.sin(angle);
  const fromWeight = sine < 1e-6 ? 1 - t : Math.sin((1 - t) * angle) / sine;
  const toWeight = (sine < 1e-6 ? t : Math.sin(t * angle) / sine) * sign;
  const mix = (a: number, b: number): number => a * fromWeight + b * toWeight;
  return normalizedQuaternion(
    mix(from.x, to.x),
    mix(from.y, to.y),
    mix(from.z, to.z),
    mix(from.w, to.w),
  );
}

function interpolatePose(from: DicePose, to: DicePose, t: number): DicePose {
  const position = {
    x: lerp(from.position.x, to.position.x, t),
    y: lerp(from.position.y, to.position.y, t),
    z: lerp(from.position.z, to.position.z, t),
  };
  return { position, quaternion: slerpQuaternion(from.quaternion, to.quaternion, t) };
}

/** The pose of a die at `tMs` for a wave launched at `startMs`, frame `i` sitting at
 *  `startMs + i × frameMs`: `null` before the launch, the last pose after it stops, and
 *  position lerp + quaternion slerp in between.
 *
 *  Example: `poseAt(poses, 1500 + DICE_FRAME_MS / 2, 1500) // halfway between poses[0] and poses[1]` */
export function poseAt(
  poses: readonly DicePose[],
  tMs: number,
  startMs: number,
  frameMs: number = DICE_FRAME_MS,
): DicePose | null {
  if (!(frameMs > 0))
    throw new RangeError(`Frame interval ${frameMs} ms is invalid: expected more than 0.`);
  const last = poses[poses.length - 1];
  if (last === undefined) throw new RangeError('Dice poses are empty: expected at least 1 pose.');
  if (tMs < startMs) return null;
  const progress = (tMs - startMs) / frameMs;
  const index = Math.floor(progress);
  const from = poses[index];
  const to = poses[index + 1];
  if (from === undefined || to === undefined) return last;
  return interpolatePose(from, to, progress - index);
}
