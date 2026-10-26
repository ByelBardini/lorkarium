import { describe, expect, it } from 'vitest';
import { IDENTITY_QUATERNION, quaternionFromAxisAngle, restingValueOf } from '../src/dice-rest';
import {
  DICE_FRAME_MS,
  decodeDiceFrames,
  encodeDiceFrames,
  poseAt,
  type DicePose,
} from '../src/dice-frames';

const Y_AXIS = { x: 0, y: 1, z: 0 };

function poseAtPosition(x: number, y: number, z: number): DicePose {
  return { position: { x, y, z }, quaternion: IDENTITY_QUATERNION };
}

const TUMBLING: DicePose[] = [
  { position: { x: -3.14159, y: 2.71828, z: 0.5 }, quaternion: IDENTITY_QUATERNION },
  {
    position: { x: 31.9994, y: -12.3456, z: 7.0001 },
    quaternion: quaternionFromAxisAngle({ x: 1, y: 2, z: 3 }, 77.7),
  },
  { position: { x: 0, y: 0.0004, z: -32 }, quaternion: { x: -0.5, y: 0.5, z: -0.5, w: 0.5 } },
];

describe('encodeDiceFrames', () => {
  it('writes 7 integers per pose: position in thousandths of a box unit, quaternion × 32767', () => {
    const frames = encodeDiceFrames([
      { position: { x: 1.5, y: -2, z: 0.25 }, quaternion: { x: 0, y: 0, z: -1, w: 0 } },
    ]);
    expect(frames).toEqual([1500, -2000, 250, 0, 0, -32767, 0]);
  });

  it('accepts a position on the ±32 limit', () => {
    expect(encodeDiceFrames([poseAtPosition(32, -32, 0)]).slice(0, 2)).toEqual([32000, -32000]);
  });

  it('a position past 32 box units is refused citing the pose, the axis and the value', () => {
    expect(() => encodeDiceFrames([poseAtPosition(0, 0, 0), poseAtPosition(0, 32.001, 0)])).toThrow(
      /Dice pose 1 position y 32.001 is outside the box: expected −32 to 32/,
    );
  });

  it('a NaN position is refused', () => {
    expect(() => encodeDiceFrames([poseAtPosition(Number.NaN, 0, 0)])).toThrow(/position x NaN/);
  });

  it('a non-unit quaternion is refused citing the norm', () => {
    const pose = { position: { x: 0, y: 0, z: 0 }, quaternion: { x: 0, y: 0, z: 0, w: 2 } };
    expect(() => encodeDiceFrames([pose])).toThrow(/Quaternion norm 2 is invalid/);
  });

  it('no pose gives no integers', () => {
    expect(encodeDiceFrames([])).toEqual([]);
  });
});

describe('decodeDiceFrames', () => {
  it('round trip comes back within 0.001 on the position and 1e-4 on the quaternion', () => {
    const decoded = decodeDiceFrames(encodeDiceFrames(TUMBLING));
    expect(decoded).toHaveLength(3);
    decoded.forEach((pose, index) => {
      const original = TUMBLING[index] ?? TUMBLING[0];
      for (const axis of ['x', 'y', 'z'] as const) {
        expect(Math.abs(pose.position[axis] - (original?.position[axis] ?? 0))).toBeLessThanOrEqual(
          0.001,
        );
      }
      for (const part of ['x', 'y', 'z', 'w'] as const) {
        expect(
          Math.abs(pose.quaternion[part] - (original?.quaternion[part] ?? 0)),
        ).toBeLessThanOrEqual(1e-4);
      }
    });
  });

  it('the decoded quaternion is renormalized, so the resting face reads it', () => {
    const [pose] = decodeDiceFrames([0, 0, 0, 1, 2, 3, 32767]);
    const { x, y, z, w } = pose?.quaternion ?? IDENTITY_QUATERNION;
    expect(Math.hypot(x, y, z, w)).toBeCloseTo(1, 12);
    expect(restingValueOf('d6', pose?.quaternion ?? IDENTITY_QUATERNION).value).toBe(1);
  });

  it('13 integers are refused citing the length and the multiple of 7', () => {
    expect(() => decodeDiceFrames(new Array<number>(13).fill(0))).toThrow(
      /Dice frames have 13 integers: expected a multiple of 7/,
    );
  });

  it('a fractional integer is refused citing its index and value', () => {
    expect(() => decodeDiceFrames([0, 0, 0.5, 0, 0, 0, 32767])).toThrow(
      /Dice frame integer 2 is 0.5: expected a whole number/,
    );
  });

  it('an all-zero quaternion is refused', () => {
    expect(() => decodeDiceFrames([0, 0, 0, 0, 0, 0, 0])).toThrow(/Quaternion norm 0 is invalid/);
  });
});

describe('poseAt', () => {
  const quarterTurn = quaternionFromAxisAngle(Y_AXIS, 90);
  const swing: DicePose[] = [
    poseAtPosition(0, 0, 0),
    { position: { x: 2, y: 4, z: -6 }, quaternion: quarterTurn },
  ];

  it('at the wave start it is the first pose', () => {
    expect(poseAt(swing, 1500, 1500)).toEqual(swing[0]);
  });

  it('one frame (1000/30 ms) after the start it is the second pose', () => {
    const pose = poseAt(swing, DICE_FRAME_MS, 0);
    expect(pose?.position).toEqual({ x: 2, y: 4, z: -6 });
    expect(pose?.quaternion.y).toBeCloseTo(quarterTurn.y, 12);
  });

  it('halfway between two frames, position is the midpoint and the rotation is slerped to 45°', () => {
    const pose = poseAt(swing, DICE_FRAME_MS / 2, 0);
    expect(pose?.position).toEqual({ x: 1, y: 2, z: -3 });
    expect(pose?.quaternion.y).toBeCloseTo(Math.sin(Math.PI / 8), 9);
    expect(pose?.quaternion.w).toBeCloseTo(Math.cos(Math.PI / 8), 9);
  });

  it('slerp takes the short way when the next quaternion has the opposite sign', () => {
    const negated = { x: -quarterTurn.x, y: -quarterTurn.y, z: -quarterTurn.z, w: -quarterTurn.w };
    const pose = poseAt(
      [
        swing[0] ?? poseAtPosition(0, 0, 0),
        { ...swing[0], position: { x: 0, y: 0, z: 0 }, quaternion: negated },
      ],
      DICE_FRAME_MS / 2,
      0,
    );
    const angle = 2 * Math.acos(Math.abs(pose?.quaternion.w ?? 0));
    expect((angle * 180) / Math.PI).toBeCloseTo(45, 9);
  });

  it('after the last frame the die stays on the last pose', () => {
    expect(poseAt(swing, 10_000, 0)).toEqual(swing[1]);
  });

  it('before the wave start the die is not thrown yet: null', () => {
    expect(poseAt(swing, 1499, 1500)).toBeNull();
  });

  it('a single frame is always that frame', () => {
    const still = [poseAtPosition(5, 1, 5)];
    expect(poseAt(still, 0, 0)).toEqual(still[0]);
    expect(poseAt(still, 999, 0)).toEqual(still[0]);
  });

  it('honors another frame interval', () => {
    expect(poseAt(swing, 50, 0, 100)?.position).toEqual({ x: 1, y: 2, z: -3 });
  });

  it('no pose is refused', () => {
    expect(() => poseAt([], 0, 0)).toThrow(/Dice poses are empty: expected at least 1 pose/);
  });

  it('a frame interval of 0 is refused citing the value', () => {
    expect(() => poseAt(swing, 0, 0, 0)).toThrow(
      /Frame interval 0 ms is invalid: expected more than 0/,
    );
  });
});
