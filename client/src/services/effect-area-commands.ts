import { BOARD_EVENTS, type EffectAreaShapeDto } from '@lorkarium/contracts';
import type { BoardCommandResult, BoardCommandSender, BoardScope } from './board-command-sender';

/** The whole shape of an area as sent: kind, origin, sizes, facing and color. */
export type EffectAreaShape = EffectAreaShapeDto;
/** Where one area is (or must still be): its id and its shape. */
export type EffectAreaShaped = Readonly<{ effectAreaId: string; shape: EffectAreaShape }>;
/** The new shape of one area of a group; `expect` (an undo) is the shape it must still have. */
export type EffectAreaReshapeTarget = EffectAreaShaped & Readonly<{ expect?: EffectAreaShape }>;

/** The area-of-effect commands of an open table; each answers with its ack, never throws.
 *
 *  Example: `await commands.createEffectAreas(scope, [circle])` */
export interface EffectAreaCommands {
  /** Any member; the ok answers the new ids in `createdIds`, in the order sent. */
  createEffectAreas(
    scope: BoardScope,
    shapes: readonly EffectAreaShape[],
  ): Promise<BoardCommandResult>;
  /** Move, stretch and turn send the whole new shape (the author or the master). */
  reshapeEffectAreas(
    scope: BoardScope,
    reshapes: readonly EffectAreaReshapeTarget[],
  ): Promise<BoardCommandResult>;
  deleteEffectAreas(
    scope: BoardScope,
    effectAreaIds: readonly string[],
    expect?: readonly EffectAreaShaped[],
  ): Promise<BoardCommandResult>;
}

/** `EffectAreaCommands` over the board command sender; an absent `expect` sends no field.
 *
 *  Example: `new RealtimeEffectAreaCommands(sender).deleteEffectAreas(scope, [id])` */
export class RealtimeEffectAreaCommands implements EffectAreaCommands {
  constructor(private readonly sender: BoardCommandSender) {}

  createEffectAreas(
    scope: BoardScope,
    shapes: readonly EffectAreaShape[],
  ): Promise<BoardCommandResult> {
    const effectAreas = [...shapes];
    return this.sender.send(BOARD_EVENTS.createEffectAreas, scope, { effectAreas });
  }

  reshapeEffectAreas(
    scope: BoardScope,
    reshapes: readonly EffectAreaReshapeTarget[],
  ): Promise<BoardCommandResult> {
    const sent = reshapes.map(({ effectAreaId, shape, expect }) => ({
      effectAreaId,
      shape,
      ...(expect && { expect }),
    }));
    return this.sender.send(BOARD_EVENTS.reshapeEffectAreas, scope, { reshapes: sent });
  }

  deleteEffectAreas(
    scope: BoardScope,
    effectAreaIds: readonly string[],
    expect?: readonly EffectAreaShaped[],
  ): Promise<BoardCommandResult> {
    const precondition = expect && {
      expect: expect.map(({ effectAreaId, shape }) => ({ effectAreaId, shape })),
    };
    return this.sender.send(BOARD_EVENTS.deleteEffectAreas, scope, {
      effectAreaIds: [...effectAreaIds],
      ...precondition,
    });
  }
}
