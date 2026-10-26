import { Body, ConvexPolyhedron, Plane, Vec3, World } from 'cannon-es';
import {
  DICE_FRAME_MS,
  diceBoxOf,
  dieShapeOf,
  encodeDiceFrames,
  restingValueOf,
  type DiceBox,
  type DicePose,
  type DieKind,
} from '@lorkarium/game-core';
import type {
  DicePhysicsPort,
  DiceThrowRequest,
  DiceThrowResult,
  DieThrowModel,
} from '../../modules/dice/dice-physics.port';
import type { DiceRandomPort } from '../../modules/dice/dice-random.port';
import { dieLaunchOf, type DieLaunch } from './die-launch';

/** The knobs of the rethrow: a landing leaning more than `maxTiltDegrees` (against a wall) is
 *  thrown again, at most `maxRethrows` times; the last landing stands either way. */
export interface CannonDicePhysicsOptions {
  readonly maxTiltDegrees?: number;
  readonly maxRethrows?: number;
}

/** 60 Hz steps, one pose kept every 2 steps (the 30 frames/s of `DICE_FRAME_MS`), 5 s per wave. */
const STEP_SECONDS = 1 / 60;
const STEPS_PER_FRAME = 2;
const MAX_STEPS = 5 * 60;
// Dice of radius 1 under Earth's 9.8 fall like boulders; 60 units/s² reads as a tabletop die.
const GRAVITY = -60;
const FRICTION = 0.3;
const RESTITUTION = 0.35;
const DAMPING = 0.1;
// Below 0.6 the pentagons of a resting d12 jitter forever and it never falls asleep.
const SLEEP_SPEED = 0.6;
const SLEEP_SECONDS = 0.25;
const DEFAULT_MAX_TILT = 10;
const DEFAULT_MAX_RETHROWS = 3;

interface DieFlight {
  readonly poses: readonly DicePose[];
  readonly last: DicePose;
  readonly settled: boolean;
}

function planeAt(position: Vec3, euler: Vec3): Body {
  const plane = new Body({ mass: 0, shape: new Plane(), position });
  plane.quaternion.setFromEuler(euler.x, euler.y, euler.z);
  return plane;
}

/** The floor and the 4 walls, each a static plane facing into the box (a plane faces +z). */
function boxPlanesOf(box: DiceBox): Body[] {
  const quarter = Math.PI / 2;
  return [
    planeAt(new Vec3(0, 0, 0), new Vec3(-quarter, 0, 0)),
    planeAt(new Vec3(-box.halfWidth, 0, 0), new Vec3(0, quarter, 0)),
    planeAt(new Vec3(box.halfWidth, 0, 0), new Vec3(0, -quarter, 0)),
    planeAt(new Vec3(0, 0, -box.halfDepth), new Vec3(0, 0, 0)),
    planeAt(new Vec3(0, 0, box.halfDepth), new Vec3(0, Math.PI, 0)),
  ];
}

function hullOf(kind: DieKind): ConvexPolyhedron {
  const shape = dieShapeOf(kind);
  return new ConvexPolyhedron({
    vertices: shape.vertices.map((vertex) => new Vec3(vertex.x, vertex.y, vertex.z)),
    faces: shape.faces.map((face) => [...face.vertices]),
  });
}

function dieBodyOf(kind: DieKind, launch: DieLaunch): Body {
  const { position, velocity, angularVelocity, quaternion } = launch;
  const body = new Body({
    mass: 1,
    shape: hullOf(kind),
    position: new Vec3(position.x, position.y, position.z),
    velocity: new Vec3(velocity.x, velocity.y, velocity.z),
    angularVelocity: new Vec3(angularVelocity.x, angularVelocity.y, angularVelocity.z),
    linearDamping: DAMPING,
    angularDamping: DAMPING,
    sleepSpeedLimit: SLEEP_SPEED,
    sleepTimeLimit: SLEEP_SECONDS,
  });
  body.quaternion.set(quaternion.x, quaternion.y, quaternion.z, quaternion.w);
  return body;
}

/** A world of its own per die: dice never collide, so one die's flight cannot move another's. */
function worldFor(box: DiceBox, die: Body): World {
  const world = new World({ gravity: new Vec3(0, GRAVITY, 0), allowSleep: true });
  world.defaultContactMaterial.friction = FRICTION;
  world.defaultContactMaterial.restitution = RESTITUTION;
  boxPlanesOf(box).forEach((plane) => world.addBody(plane));
  world.addBody(die);
  return world;
}

function poseOf(body: Body): DicePose {
  const { position: p, quaternion: q } = body;
  return { position: { x: p.x, y: p.y, z: p.z }, quaternion: { x: q.x, y: q.y, z: q.z, w: q.w } };
}

/** Steps until the die has slept for two recorded frames (the last two equal) or 5 s pass. */
function fly(kind: DieKind, launch: DieLaunch, box: DiceBox): DieFlight {
  const die = dieBodyOf(kind, launch);
  const world = worldFor(box, die);
  let last = poseOf(die);
  const poses = [last];
  let sleepingFrames = 0;
  for (let step = 1; step <= MAX_STEPS; step += 1) {
    world.step(STEP_SECONDS);
    if (step % STEPS_PER_FRAME !== 0) continue;
    last = poseOf(die);
    poses.push(last);
    sleepingFrames = die.sleepState === Body.SLEEPING ? sleepingFrames + 1 : 0;
    if (sleepingFrames === 2) return { poses, last, settled: true };
  }
  return { poses, last, settled: false };
}

/** Throws each die in a walled box sized by the roller's window and records it until it rests.
 *  The random source decides every start, so the same source state gives the same flights.
 *
 *  Example: `new CannonDicePhysics(new CryptoDiceRandom()).throw({ kinds: ['d6'], aspect: 1.5, startMs: 0 })` */
export class CannonDicePhysics implements DicePhysicsPort {
  private readonly maxTiltDegrees: number;
  private readonly maxRethrows: number;

  constructor(
    private readonly random: DiceRandomPort,
    options: CannonDicePhysicsOptions = {},
  ) {
    this.maxTiltDegrees = options.maxTiltDegrees ?? DEFAULT_MAX_TILT;
    this.maxRethrows = options.maxRethrows ?? DEFAULT_MAX_RETHROWS;
  }

  throw(request: DiceThrowRequest): DiceThrowResult {
    const box = diceBoxOf(request.aspect);
    return { models: request.kinds.map((kind) => this.throwDie(kind, box, request.startMs)) };
  }

  /** One die with its rethrows, drawn before the next die's: the draws of die n never depend
   *  on how many dice come after it. */
  private throwDie(kind: DieKind, box: DiceBox, startMs: number): DieThrowModel {
    for (let rethrows = 0; ; rethrows += 1) {
      const flight = fly(kind, dieLaunchOf(this.random, box), box);
      const face = restingValueOf(kind, flight.last.quaternion);
      const upright = flight.settled && face.tiltDegrees <= this.maxTiltDegrees;
      if (upright || rethrows >= this.maxRethrows) {
        return modelOf(kind, startMs, flight.poses, face.value, rethrows);
      }
    }
  }
}

function modelOf(
  kind: DieKind,
  startMs: number,
  poses: readonly DicePose[],
  value: number,
  rethrows: number,
): DieThrowModel {
  const settleMs = startMs + Math.ceil((poses.length - 1) * DICE_FRAME_MS);
  return { kind, startMs, settleMs, frames: encodeDiceFrames(poses), value, rethrows };
}
