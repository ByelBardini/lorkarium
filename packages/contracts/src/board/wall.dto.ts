import { z } from 'zod';
import { boardCommandShape, boardEventShape } from './board-event.dto';
import { SCENE_CELLS_MAX } from './scene.dto';
import { idGroupOf, strayExpectation, TOKEN_GROUP_MAX } from './token-id-group.dto';

/** Walls one scene keeps (conferred on the server). */
export const WALLS_PER_SCENE_MAX = 500;
/** Points of one freehand wall after the client simplifies it. */
export const WALL_POINTS_MAX = 500;
/** Straight segments one scene's walls add up to (an ellipse counts 32): the ceiling of the fog's
 *  cost, recomputed while a token is dragged. */
export const WALL_SEGMENTS_PER_SCENE_MAX = 4000;
// Points may sit this far outside their box: both are rounded to 0.01 cell.
const BOX_TOLERANCE = 0.01;

/** `wall` blocks sight and passage, `grate` only passage, `curtain` only sight, `door` both while shut. */
export const wallKindDto = z.enum(['wall', 'grate', 'curtain', 'door']);
export type WallKindDto = z.infer<typeof wallKindDto>;

export const wallShapeKindDto = z.enum(['line', 'freehand', 'rectangle', 'ellipse']);
export type WallShapeKindDto = z.infer<typeof wallShapeKindDto>;

/** A door is born `closed`; only the master locks it. */
export const doorStateDto = z.enum(['closed', 'open', 'locked']);
export type DoorStateDto = z.infer<typeof doorStateDto>;

const cellCoordinateDto = z.number().min(0).max(SCENE_CELLS_MAX);
const positiveSizeDto = z.number().positive().max(SCENE_CELLS_MAX);
const wallPointDto = z.tuple([cellCoordinateDto, cellCoordinateDto]);

const cornerShape = { x: cellCoordinateDto, y: cellCoordinateDto };

const pathFields = {
  kind: wallKindDto,
  ...cornerShape,
  width: cellCoordinateDto,
  height: cellCoordinateDto,
  points: z.array(wallPointDto),
};
const lineShape = { shape: z.literal('line'), ...pathFields };
const freehandShape = { shape: z.literal('freehand'), ...pathFields };
const areaShape = {
  kind: wallKindDto,
  shape: z.enum(['rectangle', 'ellipse']),
  ...cornerShape,
  width: positiveSizeDto,
  height: positiveSizeDto,
};

type PathFields = {
  shape: 'line' | 'freehand';
  width: number;
  height: number;
  points: [number, number][];
};

// The game-core `wall` rule, rewritten with the same messages: contracts depends only on zod.
function checkPath(path: PathFields, context: z.RefinementCtx): void {
  const count = path.points.length;
  const fits = path.shape === 'line' ? count === 2 : count >= 2 && count <= WALL_POINTS_MAX;
  if (!fits) {
    const expected = path.shape === 'line' ? '2' : `2 to ${WALL_POINTS_MAX}`;
    context.addIssue({
      code: 'custom',
      message: `${path.shape} has ${count} points; expected ${expected}`,
    });
    return;
  }
  const outside = path.points.find(
    ([x, y]) => x > path.width + BOX_TOLERANCE || y > path.height + BOX_TOLERANCE,
  );
  if (!outside) return;
  context.addIssue({
    code: 'custom',
    message: `point (${outside.join(', ')}) is outside the ${path.width} × ${path.height} box`,
  });
}

function checkStraightDoor(area: { kind: WallKindDto; shape: string }, context: z.RefinementCtx) {
  if (area.kind !== 'door') return;
  context.addIssue({ code: 'custom', message: `door must be a line; got ${area.shape}` });
}

/** A wall as the master draws it: line and freehand points relative to `(x, y)`, or a rectangle
 *  or an ellipse in its box. A door is always a line; its state is the server's (born closed).
 *
 *  Example: `wallShapeDto.parse({ kind: 'grate', shape: 'rectangle', x: 2, y: 2, width: 4, height: 3 })` */
export const wallShapeDto = z.discriminatedUnion('shape', [
  z.strictObject(lineShape).superRefine(checkPath),
  z.strictObject(freehandShape).superRefine(checkPath),
  z.strictObject(areaShape).superRefine(checkStraightDoor),
]);
export type WallShapeDto = z.infer<typeof wallShapeDto>;

const confirmedShape = { id: z.uuid(), doorState: doorStateDto.nullable() };

function checkDoorState(
  value: { kind: WallKindDto; doorState: DoorStateDto | null },
  context: z.RefinementCtx,
) {
  if (value.kind === 'door' && value.doorState === null) {
    context.addIssue({
      code: 'custom',
      message: 'door has doorState null; expected closed, open or locked',
    });
  }
  if (value.kind !== 'door' && value.doorState !== null) {
    context.addIssue({
      code: 'custom',
      message: `${value.kind} has doorState ${value.doorState}; expected null`,
    });
  }
}

// Extending a refined object throws in Zod 4, so the confirmed wall is built whole again.
/** A confirmed wall: the shape plus its id and `doorState` (only a door has one). */
export const wallDto = z.discriminatedUnion('shape', [
  z
    .strictObject({ ...confirmedShape, ...lineShape })
    .superRefine(checkPath)
    .superRefine(checkDoorState),
  z
    .strictObject({ ...confirmedShape, ...freehandShape })
    .superRefine(checkPath)
    .superRefine(checkDoorState),
  z
    .strictObject({ ...confirmedShape, ...areaShape })
    .superRefine(checkStraightDoor)
    .superRefine(checkDoorState),
]);
export type WallDto = z.infer<typeof wallDto>;

const wallMoveDto = z.strictObject({
  wallId: z.uuid(),
  ...cornerShape,
  expect: z.strictObject(cornerShape).optional(),
});
export type WallMoveDto = z.infer<typeof wallMoveDto>;

const wallAtDto = z.strictObject({ wallId: z.uuid(), ...cornerShape });
export type WallAtDto = z.infer<typeof wallAtDto>;

const wallKindOfDto = z.strictObject({ wallId: z.uuid(), kind: wallKindDto });
export type WallKindOfDto = z.infer<typeof wallKindOfDto>;

const wallIdGroupDto = idGroupOf(z.uuid(), (wallId) => wallId, 'wall');

function strayCheck(verb: string) {
  return (
    command: { wallIds: string[]; expect?: { wallId: string }[] | undefined },
    context: z.RefinementCtx,
  ) => {
    const stray = strayExpectation(
      command.wallIds,
      (command.expect ?? []).map((expected) => expected.wallId),
    );
    if (stray === undefined) return;
    context.addIssue({
      code: 'custom',
      message: `wall ${stray} is not being ${verb}; expected only ids in wallIds`,
    });
  };
}

/** `wall:createMany` (master): 1 to 64 walls, all or nothing, one version.
 *
 *  Example: `createWallsCommandDto.parse({ actionId, campaignId, walls: [northLine] })` */
export const createWallsCommandDto = z.strictObject({
  ...boardCommandShape,
  walls: z.array(wallShapeDto).min(1).max(TOKEN_GROUP_MAX),
});
export type CreateWallsCommandDto = z.infer<typeof createWallsCommandDto>;

/** `wall:moveMany` (master); `expect` is the undo precondition.
 *
 *  Example: `moveWallsCommandDto.parse({ actionId, campaignId, moves: [{ wallId, x: 3, y: 2 }] })` */
export const moveWallsCommandDto = z.strictObject({
  ...boardCommandShape,
  moves: idGroupOf(wallMoveDto, (move) => move.wallId, 'wall'),
});
export type MoveWallsCommandDto = z.infer<typeof moveWallsCommandDto>;

/** `wall:deleteMany` (master); `expect` lists where each wall must still be.
 *
 *  Example: `deleteWallsCommandDto.parse({ actionId, campaignId, wallIds: [id] })` */
export const deleteWallsCommandDto = z
  .strictObject({
    ...boardCommandShape,
    wallIds: wallIdGroupDto,
    expect: z.array(wallAtDto).max(TOKEN_GROUP_MAX).optional(),
  })
  .superRefine(strayCheck('deleted'));
export type DeleteWallsCommandDto = z.infer<typeof deleteWallsCommandDto>;

/** `wall:setKindMany` (master): one kind for every wall; a door becomes `closed`, leaving door
 *  drops the state. `expect` lists the kind each wall must still have (undo).
 *
 *  Example: `setWallKindsCommandDto.parse({ actionId, campaignId, wallIds: [id], kind: 'grate' })` */
export const setWallKindsCommandDto = z
  .strictObject({
    ...boardCommandShape,
    wallIds: wallIdGroupDto,
    kind: wallKindDto,
    expect: z.array(wallKindOfDto).max(TOKEN_GROUP_MAX).optional(),
  })
  .superRefine(strayCheck('changed'));
export type SetWallKindsCommandDto = z.infer<typeof setWallKindsCommandDto>;

/** `wall:setDoor`: the master sets any state; a player opens or closes an unlocked door one of
 *  their tokens sees.
 *
 *  Example: `setDoorCommandDto.parse({ actionId, campaignId, wallId, state: 'open' })` */
export const setDoorCommandDto = z.strictObject({
  ...boardCommandShape,
  wallId: z.uuid(),
  state: doorStateDto,
});
export type SetDoorCommandDto = z.infer<typeof setDoorCommandDto>;

export const wallsCreatedDto = z.strictObject({ ...boardEventShape, walls: z.array(wallDto) });
export type WallsCreatedDto = z.infer<typeof wallsCreatedDto>;

export const wallsMovedDto = z.strictObject({ ...boardEventShape, moves: z.array(wallAtDto) });
export type WallsMovedDto = z.infer<typeof wallsMovedDto>;

export const wallsDeletedDto = z.strictObject({
  ...boardEventShape,
  wallIds: z.array(z.uuid()),
});
export type WallsDeletedDto = z.infer<typeof wallsDeletedDto>;

const wallKindChangeDto = z.strictObject({
  wallId: z.uuid(),
  kind: wallKindDto,
  doorState: doorStateDto.nullable(),
});
export type WallKindChangeDto = z.infer<typeof wallKindChangeDto>;

export const wallKindsChangedDto = z.strictObject({
  ...boardEventShape,
  changes: z.array(wallKindChangeDto),
});
export type WallKindsChangedDto = z.infer<typeof wallKindsChangedDto>;

export const doorChangedDto = z.strictObject({
  ...boardEventShape,
  wallId: z.uuid(),
  doorState: doorStateDto,
});
export type DoorChangedDto = z.infer<typeof doorChangedDto>;

/** `wall:eraseSegment` (master): takes one straight piece (the `wallSegments` index of the
 *  game-core) out of a wall, all in one version: the wall goes and what is left comes back as new
 *  walls (`createdIds` in the ack). `expect` is the corner the wall must still have.
 *
 *  Example: `eraseWallSegmentCommandDto.parse({ actionId, campaignId, wallId, segmentIndex: 0 })` */
export const eraseWallSegmentCommandDto = z.strictObject({
  ...boardCommandShape,
  wallId: z.uuid(),
  segmentIndex: z.number().int().min(0).max(WALL_SEGMENTS_PER_SCENE_MAX),
  expect: z.strictObject(cornerShape).optional(),
});
export type EraseWallSegmentCommandDto = z.infer<typeof eraseWallSegmentCommandDto>;

export const wallSegmentErasedDto = z.strictObject({
  ...boardEventShape,
  wallId: z.uuid(),
  walls: z.array(wallDto),
});
export type WallSegmentErasedDto = z.infer<typeof wallSegmentErasedDto>;

/** `wall:eraseArea` (master): the eraser box of the walls tool, in fractional cells. Every wall it
 *  covers is cut exactly at its edges (`wallOutsideBox` of the game-core), all in one version: the
 *  walls touched go and what is left comes back as new walls (`createdIds` in the ack, in the
 *  order of the scene's walls).
 *
 *  Example: `eraseWallAreaCommandDto.parse({ actionId, campaignId, box: { x: 2, y: 1, width: 2, height: 2 } })` */
export const eraseWallAreaCommandDto = z.strictObject({
  ...boardCommandShape,
  box: z.strictObject({
    x: z.number(),
    y: z.number(),
    width: z.number().positive(),
    height: z.number().positive(),
  }),
});
export type EraseWallAreaCommandDto = z.infer<typeof eraseWallAreaCommandDto>;

export const wallAreaErasedDto = z.strictObject({
  ...boardEventShape,
  wallIds: z.array(z.uuid()).max(WALLS_PER_SCENE_MAX),
  walls: z.array(wallDto),
});
export type WallAreaErasedDto = z.infer<typeof wallAreaErasedDto>;
