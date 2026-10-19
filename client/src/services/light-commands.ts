import { BOARD_EVENTS, type LightPlacementDto } from '@lorkarium/contracts';
import type { BoardCommandResult, BoardCommandSender } from './board-command-sender';

/** A map light as the master places it: the point in fractional cells and its range. */
export type LightPlacement = LightPlacementDto;
export type LightPoint = Readonly<{ x: number; y: number }>;
export type LightReach = Readonly<{ bright: number; dim: number }>;
/** Where one light is (or must still be), in fractional cells. */
export type LightAt = Readonly<{ lightId: string }> & LightPoint;
/** A light move; `expect` (an undo) is where it must still be, or STALE_UNDO. */
export type LightMoveTarget = LightAt & Readonly<{ expect?: LightPoint }>;
/** A range change; `expect` (an undo) is the range it must still have, or STALE_UNDO. */
export type LightRangeTarget = Readonly<{ lightId: string; expect?: LightReach }> & LightReach;

/** The map light commands of an open table (the master's); each answers with its ack, never throws.
 *
 *  Example: `await commands.createLights(campaignId, [{ x: 5.5, y: 3, bright: 4, dim: 4 }])` */
export interface LightCommands {
  /** The ok answers the new ids in `createdIds`, in the order sent. */
  createLights(campaignId: string, lights: readonly LightPlacement[]): Promise<BoardCommandResult>;
  moveLights(campaignId: string, moves: readonly LightMoveTarget[]): Promise<BoardCommandResult>;
  setLightRanges(
    campaignId: string,
    changes: readonly LightRangeTarget[],
  ): Promise<BoardCommandResult>;
  setLightsLit(
    campaignId: string,
    lightIds: readonly string[],
    lit: boolean,
  ): Promise<BoardCommandResult>;
  deleteLights(
    campaignId: string,
    lightIds: readonly string[],
    expect?: readonly LightAt[],
  ): Promise<BoardCommandResult>;
}

/** `LightCommands` over the board command sender; an absent `expect` sends no field.
 *
 *  Example: `new RealtimeLightCommands(sender).setLightsLit(campaignId, [torchId], false)` */
export class RealtimeLightCommands implements LightCommands {
  constructor(private readonly sender: BoardCommandSender) {}

  createLights(campaignId: string, lights: readonly LightPlacement[]): Promise<BoardCommandResult> {
    const placed = lights.map(({ x, y, bright, dim }) => ({ x, y, bright, dim }));
    return this.sender.send(BOARD_EVENTS.createLights, campaignId, { lights: placed });
  }

  moveLights(campaignId: string, moves: readonly LightMoveTarget[]): Promise<BoardCommandResult> {
    const sent = moves.map(({ lightId, x, y, expect }) => ({
      lightId,
      x,
      y,
      ...(expect && { expect: { x: expect.x, y: expect.y } }),
    }));
    return this.sender.send(BOARD_EVENTS.moveLights, campaignId, { moves: sent });
  }

  setLightRanges(
    campaignId: string,
    changes: readonly LightRangeTarget[],
  ): Promise<BoardCommandResult> {
    const sent = changes.map(({ lightId, bright, dim, expect }) => ({
      lightId,
      bright,
      dim,
      ...(expect && { expect: { bright: expect.bright, dim: expect.dim } }),
    }));
    return this.sender.send(BOARD_EVENTS.setLightRanges, campaignId, { changes: sent });
  }

  setLightsLit(
    campaignId: string,
    lightIds: readonly string[],
    lit: boolean,
  ): Promise<BoardCommandResult> {
    return this.sender.send(BOARD_EVENTS.setLightsLit, campaignId, {
      lightIds: [...lightIds],
      lit,
    });
  }

  deleteLights(
    campaignId: string,
    lightIds: readonly string[],
    expect?: readonly LightAt[],
  ): Promise<BoardCommandResult> {
    const precondition = expect && {
      expect: expect.map(({ lightId, x, y }) => ({ lightId, x, y })),
    };
    return this.sender.send(BOARD_EVENTS.deleteLights, campaignId, {
      lightIds: [...lightIds],
      ...precondition,
    });
  }
}
