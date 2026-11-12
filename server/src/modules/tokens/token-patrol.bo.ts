import type { PlanLimits } from '@lorkarium/contracts';
import {
  cell,
  patrolFits,
  patrolPoseAt,
  tokenSize,
  type SceneSize,
  type TokenPatrol,
} from '@lorkarium/game-core';
import { PlanLimitsBo } from '../plans/plan-limits.bo';
import {
  OutOfSceneError,
  TokenPatrolLimitError,
  TokenPatrolNotFoundError,
  type SizeRef,
} from './tokens.error';

/** Where a token stands and looks. */
export type TokenPose = Readonly<{ col: number; row: number; facing: number }>;

/** A saved patrol: the route, the cycle step it walks from and when it started (`null` = paused,
 *  by the server clock). */
export type PatrolTimeline = Readonly<{
  patrol: TokenPatrol;
  step: number;
  startedAt: Date | null;
}>;

/** A token as the patrol rule reads it: its stored pose (while it runs, where the walk back
 *  starts), its size and its patrol (`null` = none). */
export type PatrolledToken = Readonly<{
  tokenId: string;
  pose: TokenPose;
  size: SizeRef;
  timeline: PatrolTimeline | null;
}>;

/** What one token saves: its patrol (`null` = taken away) and its pose. */
export type PatrolWrite = Readonly<{
  tokenId: string;
  timeline: PatrolTimeline | null;
  pose: TokenPose;
}>;

/** The pose of now and the cycle step to resume from. */
export type PatrolPoseNow = Readonly<{ pose: TokenPose; step: number }>;

export type TokenPatrolState = Readonly<{
  scene: SceneSize;
  /** Patrols a grid keeps running at most (`TOKEN_PATROLS_RUNNING_MAX`, passed in). */
  runningLimit: number;
  /** The table's effective limits (its owner's plan): `maxPatrols` running per grid. */
  plan: PlanLimits;
}>;

/** Where a token stands now: a running patrol puts it where its timeline is (the destination of
 *  the step under way), turned to where it walks when the patrol turns; a paused one (or none)
 *  leaves the stored pose. The step is the one to resume from (the stored one while it walks back).
 *
 *  Example: `patrolPoseNowOf(kael, clock.now()) // { pose: { col: 2, row: 0, facing: 0 }, step: 2 }` */
export function patrolPoseNowOf(token: PatrolledToken, now: Date): PatrolPoseNow {
  const { timeline, pose } = token;
  if (!timeline?.startedAt) return { pose, step: timeline?.step ?? 0 };
  const origin = cell(pose.col, pose.row);
  const elapsedMs = now.getTime() - timeline.startedAt.getTime();
  const at = patrolPoseAt({ patrol: timeline.patrol, step: timeline.step, origin, elapsedMs });
  const walked = { col: at.cell.col, row: at.cell.row, facing: at.facing ?? pose.facing };
  return { pose: walked, step: at.step ?? timeline.step };
}

/** The master's patrol of a token (spec §3.9): the route fits the scene at the token's size,
 *  saving or removing pauses it where it is now, and a start keeps the grid at its ceiling of
 *  running patrols. No clock: `now` comes in.
 *
 *  Example: `new TokenPatrolBo({ scene, runningLimit: 30, plan }).start([kael], 29, now)` */
export class TokenPatrolBo {
  constructor(private readonly state: TokenPatrolState) {}

  /** A new route from step 0: a running patrol starts over from where the token is now (it walks
   *  back to the first point); a paused one stays paused. */
  save(token: PatrolledToken, patrol: TokenPatrol, now: Date): PatrolWrite {
    this.requireFits(patrol, token.size);
    const running = Boolean(token.timeline?.startedAt);
    const timeline = { patrol, step: 0, startedAt: running ? now : null };
    return { tokenId: token.tokenId, timeline, pose: patrolPoseNowOf(token, now).pose };
  }

  /** The patrol taken away; a running one leaves the token where it is now. */
  remove(token: PatrolledToken, now: Date): PatrolWrite {
    return { tokenId: token.tokenId, timeline: null, pose: patrolPoseNowOf(token, now).pose };
  }

  /** The patrols that start, all or nothing: one without a route is TOKEN_PATROL_NOT_FOUND, a
   *  route that no longer fits the token is OUT_OF_SCENE, passing the table's plan with the
   *  `running` ones is PLAN_LIMIT `patrols` and passing the technical ceiling TOKEN_PATROL_LIMIT.
   *  The ones already running are left out. */
  start(tokens: readonly PatrolledToken[], running: number, now: Date): PatrolWrite[] {
    const starting = tokens.filter((token) => this.startable(token));
    PlanLimitsBo.requireRoom('patrols', running, starting.length, this.state.plan);
    if (running + starting.length > this.state.runningLimit) {
      throw new TokenPatrolLimitError(running, starting.length, this.state.runningLimit);
    }
    return starting.map(({ tokenId, pose, timeline }) => ({
      tokenId,
      pose,
      timeline: timeline && { ...timeline, startedAt: now },
    }));
  }

  /** The running patrols, paused where each token is now with the step to resume from; the ones
   *  paused already (or without a route) are left out. */
  pause(tokens: readonly PatrolledToken[], now: Date): PatrolWrite[] {
    return tokens.flatMap((token) => {
      if (!token.timeline?.startedAt) return [];
      const { pose, step } = patrolPoseNowOf(token, now);
      return [
        { tokenId: token.tokenId, pose, timeline: { ...token.timeline, step, startedAt: null } },
      ];
    });
  }

  // A route is needed; an already running one changes nothing; the route must still fit.
  private startable({ tokenId, size, timeline }: PatrolledToken): boolean {
    if (!timeline) throw new TokenPatrolNotFoundError(tokenId);
    if (timeline.startedAt) return false;
    this.requireFits(timeline.patrol, size);
    return true;
  }

  private requireFits(patrol: TokenPatrol, size: SizeRef): void {
    const footprint = tokenSize(size.width, size.height);
    const outside = patrolFits(this.state.scene, patrol.path, footprint);
    if (outside) throw new OutOfSceneError(outside, footprint, this.state.scene);
  }
}
