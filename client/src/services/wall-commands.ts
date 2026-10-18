import {
  BOARD_EVENTS,
  type DoorStateDto,
  type WallKindDto,
  type WallShapeDto,
} from '@lorkarium/contracts';
import type { BoardCommandResult, BoardCommandSender } from './board-command-sender';

/** A wall as the master draws it: kind, shape, box and (line, freehand) points. */
export type WallShape = WallShapeDto;
export type WallKind = WallKindDto;
export type DoorState = DoorStateDto;
export type WallPosition = Readonly<{ x: number; y: number }>;
/** Where one wall is (or must still be), in fractional cells. */
export type WallPlacement = Readonly<{ wallId: string }> & WallPosition;
/** The eraser box of the walls tool, in fractional cells. */
export type WallEraseBox = Readonly<{ x: number; y: number; width: number; height: number }>;
/** The kind one wall must still have when an undo changes it back. */
export type WallKindOf = Readonly<{ wallId: string; kind: WallKind }>;

/** The wall commands of an open table (the master's, and the door any member opens); each
 *  answers with its ack, never throws.
 *
 *  Example: `await commands.createWalls(campaignId, [northLine])` */
export interface WallCommands {
  /** The ok answers the new ids in `createdIds`, in the order sent. */
  createWalls(campaignId: string, shapes: readonly WallShape[]): Promise<BoardCommandResult>;
  /** Cuts every wall under the box at its edges; the ok answers the ids of what is left. */
  eraseWallArea(campaignId: string, box: WallEraseBox): Promise<BoardCommandResult>;
  /** Takes piece `segmentIndex` out of the wall; the ok answers the ids of what is left. */
  eraseWallSegment(
    campaignId: string,
    wallId: string,
    segmentIndex: number,
    expect?: WallPosition,
  ): Promise<BoardCommandResult>;
  deleteWalls(
    campaignId: string,
    wallIds: readonly string[],
    expect?: readonly WallPlacement[],
  ): Promise<BoardCommandResult>;
  setWallKinds(
    campaignId: string,
    wallIds: readonly string[],
    kind: WallKind,
    expect?: readonly WallKindOf[],
  ): Promise<BoardCommandResult>;
  setDoor(campaignId: string, wallId: string, state: DoorState): Promise<BoardCommandResult>;
}

/** `WallCommands` over the board command sender; an absent `expect` sends no field.
 *
 *  Example: `new RealtimeWallCommands(sender).setDoor(campaignId, doorId, 'open')` */
export class RealtimeWallCommands implements WallCommands {
  constructor(private readonly sender: BoardCommandSender) {}

  createWalls(campaignId: string, shapes: readonly WallShape[]): Promise<BoardCommandResult> {
    return this.sender.send(BOARD_EVENTS.createWalls, campaignId, { walls: [...shapes] });
  }

  eraseWallArea(campaignId: string, box: WallEraseBox): Promise<BoardCommandResult> {
    const { x, y, width, height } = box;
    return this.sender.send(BOARD_EVENTS.eraseWallArea, campaignId, {
      box: { x, y, width, height },
    });
  }

  eraseWallSegment(
    campaignId: string,
    wallId: string,
    segmentIndex: number,
    expect?: WallPosition,
  ): Promise<BoardCommandResult> {
    return this.sender.send(BOARD_EVENTS.eraseWallSegment, campaignId, {
      wallId,
      segmentIndex,
      ...(expect && { expect: { x: expect.x, y: expect.y } }),
    });
  }

  deleteWalls(
    campaignId: string,
    wallIds: readonly string[],
    expect?: readonly WallPlacement[],
  ): Promise<BoardCommandResult> {
    const precondition = expect && { expect: expect.map(({ wallId, x, y }) => ({ wallId, x, y })) };
    return this.sender.send(BOARD_EVENTS.deleteWalls, campaignId, {
      wallIds: [...wallIds],
      ...precondition,
    });
  }

  setWallKinds(
    campaignId: string,
    wallIds: readonly string[],
    kind: WallKind,
    expect?: readonly WallKindOf[],
  ): Promise<BoardCommandResult> {
    const precondition = expect && {
      expect: expect.map(({ wallId, kind: was }) => ({ wallId, kind: was })),
    };
    return this.sender.send(BOARD_EVENTS.setWallKinds, campaignId, {
      wallIds: [...wallIds],
      kind,
      ...precondition,
    });
  }

  setDoor(campaignId: string, wallId: string, state: DoorState): Promise<BoardCommandResult> {
    return this.sender.send(BOARD_EVENTS.setDoor, campaignId, { wallId, state });
  }
}
