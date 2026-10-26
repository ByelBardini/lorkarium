import type { DiceBox, Quaternion, Vector3 } from '@lorkarium/game-core';
import type { DiceRandomPort } from '../../modules/dice/dice-random.port';

/** Where a die starts, how it moves and spins, and its first rotation (units per second). */
export interface DieLaunch {
  readonly position: Vector3;
  readonly velocity: Vector3;
  readonly angularVelocity: Vector3;
  readonly quaternion: Quaternion;
}

/** Every launch takes exactly this many `unit()`: a die's throw never shifts the next one's. */
export const DIE_LAUNCH_DRAWS = 12;

// A die spawns at least one diameter from every wall, so it never starts inside one.
const SPAWN_MARGIN = 2;
const SPAWN_HEIGHT = { min: 4, span: 2 };
const SPEED = { min: 18, span: 10 };
const MAX_FALL_SPEED = 4;
const MAX_SPIN = 25;

function between(random: DiceRandomPort, min: number, max: number): number {
  return min + random.unit() * (max - min);
}

function spawnOf(random: DiceRandomPort, box: DiceBox): Vector3 {
  const x = box.halfWidth - SPAWN_MARGIN;
  const z = box.halfDepth - SPAWN_MARGIN;
  return {
    x: between(random, -x, x),
    y: SPAWN_HEIGHT.min + random.unit() * SPAWN_HEIGHT.span,
    z: between(random, -z, z),
  };
}

function velocityOf(random: DiceRandomPort): Vector3 {
  const heading = random.unit() * 2 * Math.PI;
  const speed = SPEED.min + random.unit() * SPEED.span;
  const fall = random.unit() * MAX_FALL_SPEED;
  return { x: Math.cos(heading) * speed, y: -fall, z: Math.sin(heading) * speed };
}

function spinOf(random: DiceRandomPort): Vector3 {
  return {
    x: between(random, -MAX_SPIN, MAX_SPIN),
    y: between(random, -MAX_SPIN, MAX_SPIN),
    z: between(random, -MAX_SPIN, MAX_SPIN),
  };
}

/** A uniformly random rotation from three uniforms (Shoemake, "Uniform random rotations"). */
function rotationOf(random: DiceRandomPort): Quaternion {
  const [u1, u2, u3] = [random.unit(), random.unit(), random.unit()];
  const low = Math.sqrt(1 - u1);
  const high = Math.sqrt(u1);
  const turn = 2 * Math.PI;
  return {
    x: low * Math.sin(turn * u2),
    y: low * Math.cos(turn * u2),
    z: high * Math.sin(turn * u3),
    w: high * Math.cos(turn * u3),
  };
}

/** The random start of one throw inside `box`, drawn from `random` in a fixed order.
 *
 *  Example: `dieLaunchOf(new CryptoDiceRandom(), diceBoxOf(16 / 9)).position.y // 4 to 6` */
export function dieLaunchOf(random: DiceRandomPort, box: DiceBox): DieLaunch {
  const position = spawnOf(random, box);
  const velocity = velocityOf(random);
  const angularVelocity = spinOf(random);
  return { position, velocity, angularVelocity, quaternion: rotationOf(random) };
}
