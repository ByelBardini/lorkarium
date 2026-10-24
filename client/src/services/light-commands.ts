import { BOARD_EVENTS, type LightPlacementDto } from '@lorkarium/contracts';
import type { LightColor } from '@/lib/light-color';
import type { BoardCommandResult, BoardCommandSender, BoardScope } from './board-command-sender';

/** A map light as the master places it: the point in fractional cells, its range, its color and
 *  its cone (`facing`, and `angle` 360 = every side). */
export type LightPlacement = LightPlacementDto;
export type LightPoint = Readonly<{ x: number; y: number }>;
export type LightReach = Readonly<{ bright: number; dim: number }>;
/** Where one light is (or must still be), in fractional cells. */
export type LightAt = Readonly<{ lightId: string }> & LightPoint;
/** A light move; `expect` (an undo) is where it must still be, or STALE_UNDO. */
export type LightMoveTarget = LightAt & Readonly<{ expect?: LightPoint }>;
/** A range change; `expect` (an undo) is the range it must still have, or STALE_UNDO. */
export type LightRangeTarget = Readonly<{ lightId: string; expect?: LightReach }> & LightReach;
/** A color change; `expect` (an undo) is the color it must still have, or STALE_UNDO. */
export type LightColorTarget = Readonly<{
  lightId: string;
  color: LightColor;
  expect?: Readonly<{ color: LightColor }>;
}>;

/** Where a light points and how wide it opens, in degrees. */
export type LightCone = Readonly<{ facing: number; angle: number }>;
/** A cone change; `expect` (an undo) is the cone it must still have, or STALE_UNDO. */
export type LightConeTarget = Readonly<{ lightId: string; expect?: LightCone }> & LightCone;

/** The map light commands of an open table (the master's); each answers with its ack, never throws.
 *
 *  Example: `await commands.createLights(scope, [{ x: 5.5, y: 3, bright: 4, dim: 4, color: null }])` */
export interface LightCommands {
  /** The ok answers the new ids in `createdIds`, in the order sent. */
  createLights(scope: BoardScope, lights: readonly LightPlacement[]): Promise<BoardCommandResult>;
  moveLights(scope: BoardScope, moves: readonly LightMoveTarget[]): Promise<BoardCommandResult>;
  setLightRanges(
    scope: BoardScope,
    changes: readonly LightRangeTarget[],
  ): Promise<BoardCommandResult>;
  setLightColors(
    scope: BoardScope,
    changes: readonly LightColorTarget[],
  ): Promise<BoardCommandResult>;
  setLightCones(
    scope: BoardScope,
    changes: readonly LightConeTarget[],
  ): Promise<BoardCommandResult>;
  setLightsLit(
    scope: BoardScope,
    lightIds: readonly string[],
    lit: boolean,
  ): Promise<BoardCommandResult>;
  deleteLights(
    scope: BoardScope,
    lightIds: readonly string[],
    expect?: readonly LightAt[],
  ): Promise<BoardCommandResult>;
}

/** `LightCommands` over the board command sender; an absent `expect` sends no field.
 *
 *  Example: `new RealtimeLightCommands(sender).setLightsLit(scope, [torchId], false)` */
export class RealtimeLightCommands implements LightCommands {
  constructor(private readonly sender: BoardCommandSender) {}

  createLights(scope: BoardScope, lights: readonly LightPlacement[]): Promise<BoardCommandResult> {
    const placed = lights.map(({ x, y, bright, dim, color, facing, angle }) => ({
      x,
      y,
      bright,
      dim,
      color,
      facing,
      angle,
    }));
    return this.sender.send(BOARD_EVENTS.createLights, scope, { lights: placed });
  }

  moveLights(scope: BoardScope, moves: readonly LightMoveTarget[]): Promise<BoardCommandResult> {
    const sent = moves.map(({ lightId, x, y, expect }) => ({
      lightId,
      x,
      y,
      ...(expect && { expect: { x: expect.x, y: expect.y } }),
    }));
    return this.sender.send(BOARD_EVENTS.moveLights, scope, { moves: sent });
  }

  setLightRanges(
    scope: BoardScope,
    changes: readonly LightRangeTarget[],
  ): Promise<BoardCommandResult> {
    const sent = changes.map(({ lightId, bright, dim, expect }) => ({
      lightId,
      bright,
      dim,
      ...(expect && { expect: { bright: expect.bright, dim: expect.dim } }),
    }));
    return this.sender.send(BOARD_EVENTS.setLightRanges, scope, { changes: sent });
  }

  setLightColors(
    scope: BoardScope,
    changes: readonly LightColorTarget[],
  ): Promise<BoardCommandResult> {
    const sent = changes.map(({ lightId, color, expect }) => ({
      lightId,
      color,
      ...(expect && { expect: { color: expect.color } }),
    }));
    return this.sender.send(BOARD_EVENTS.setLightColors, scope, { changes: sent });
  }

  setLightCones(
    scope: BoardScope,
    changes: readonly LightConeTarget[],
  ): Promise<BoardCommandResult> {
    const sent = changes.map(({ lightId, facing, angle, expect }) => ({
      lightId,
      facing,
      angle,
      ...(expect && { expect: { facing: expect.facing, angle: expect.angle } }),
    }));
    return this.sender.send(BOARD_EVENTS.setLightCones, scope, { changes: sent });
  }

  setLightsLit(
    scope: BoardScope,
    lightIds: readonly string[],
    lit: boolean,
  ): Promise<BoardCommandResult> {
    return this.sender.send(BOARD_EVENTS.setLightsLit, scope, {
      lightIds: [...lightIds],
      lit,
    });
  }

  deleteLights(
    scope: BoardScope,
    lightIds: readonly string[],
    expect?: readonly LightAt[],
  ): Promise<BoardCommandResult> {
    const precondition = expect && {
      expect: expect.map(({ lightId, x, y }) => ({ lightId, x, y })),
    };
    return this.sender.send(BOARD_EVENTS.deleteLights, scope, {
      lightIds: [...lightIds],
      ...precondition,
    });
  }
}
