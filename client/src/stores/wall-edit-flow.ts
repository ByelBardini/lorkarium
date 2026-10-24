import type { WallDto, WallKindDto } from '@lorkarium/contracts';
import type { StoreApi } from 'zustand/vanilla';
import { shapeOfWall, wallAreaEraseOf, wallRestOf } from '@/lib/wall-geometry';
import type { WallEraseBox } from '@/services/wall-commands';
import type { BoardCommandResult } from '@/services/table-board-commands';
import type { BoardInteractionDeps, BoardInteractionStore } from './board-interaction-store';

type StoreAccess = Pick<StoreApi<BoardInteractionStore>, 'getState' | 'setState'>;

export const ONLY_LINES_BECOME_DOORS = 'Só parede reta vira porta.';
export const NOTHING_TO_ERASE = 'Nada para apagar aqui.';

/** The erase actions: the whole wall (`null`) is a delete; one piece is one `eraseWallSegment`,
 *  recorded as the wall going and what is left coming, so Ctrl+Z gives the whole wall back.
 *
 *  Example: `await eraseWallOf(deps, store, grateBox, 0)` */
export async function eraseWallOf(
  deps: BoardInteractionDeps,
  store: StoreAccess,
  wall: WallDto,
  segmentIndex: number | null,
): Promise<void> {
  if (segmentIndex === null) return deleteWallsOf(deps, store, [wall]);
  const { getState, setState } = store;
  if (getState().readOnly) return;
  const rest = wallRestOf(wall, segmentIndex);
  const at = { x: wall.x, y: wall.y };
  const result = await deps.commands.eraseWallSegment(deps.scopeOf(), wall.id, segmentIndex, at);
  if (!result.ok) return sayRefusal(deps, store, result);
  setState({ selectedWallIds: getState().selectedWallIds.filter((id) => id !== wall.id) });
  const added = rest.map((shape, index) => ({ id: result.createdIds?.[index] ?? '', shape }));
  deps.recordEdit?.([
    { kind: 'wallsRemoved', walls: [{ id: wall.id, shape: shapeOfWall(wall) }] },
    { kind: 'wallsAdded', walls: added },
  ]);
}

/** The eraser box released: the walls under it, cut at its edges, in one `eraseWallArea`; one
 *  undo entry takes what is left out and gives the whole walls back. Over no wall, nothing goes.
 *
 *  Example: `await eraseWallAreaOf(deps, store, board.walls, { x: 3, y: 1, width: 2, height: 2 })` */
export async function eraseWallAreaOf(
  deps: BoardInteractionDeps,
  store: StoreAccess,
  walls: readonly WallDto[],
  box: WallEraseBox,
): Promise<void> {
  if (store.getState().readOnly) return;
  const { erased, rest } = wallAreaEraseOf(walls, box);
  if (erased.length === 0) return store.setState({ notice: NOTHING_TO_ERASE });
  const result = await deps.commands.eraseWallArea(deps.scopeOf(), box);
  if (!result.ok) return sayRefusal(deps, store, result);
  const removed = erased.map((wall) => ({ id: wall.id, shape: shapeOfWall(wall) }));
  const added = rest.map((shape, index) => ({ id: result.createdIds?.[index] ?? '', shape }));
  deps.recordEdit?.([
    { kind: 'wallsRemoved', walls: removed },
    { kind: 'wallsAdded', walls: added },
  ]);
}

/** Deletes the walls (Delete / Backspace on the selection) in one command; confirmed, they leave
 *  the selection and go on the undo stack with their shapes, to be drawn again.
 *
 *  Example: `await deleteWallsOf(deps, store, selectedWalls)` */
export async function deleteWallsOf(
  deps: BoardInteractionDeps,
  store: StoreAccess,
  walls: readonly WallDto[],
): Promise<void> {
  const { getState, setState } = store;
  if (getState().readOnly || walls.length === 0) return;
  const ids = walls.map(({ id }) => id);
  const result = await deps.commands.deleteWalls(deps.scopeOf(), ids);
  if (!result.ok) return sayRefusal(deps, store, result);
  setState({ selectedWallIds: getState().selectedWallIds.filter((id) => !ids.includes(id)) });
  const removed = walls.map((wall) => ({ id: wall.id, shape: shapeOfWall(wall) }));
  deps.recordEdit?.([{ kind: 'wallsRemoved', walls: removed }]);
}

/** Gives the walls one kind in one command, recorded with the kinds they had. Only a line becomes
 *  a door: with any other shape among them nothing is sent and the status line says so.
 *
 *  Example: `await changeWallKindsOf(deps, store, selectedWalls, 'grate')` */
export async function changeWallKindsOf(
  deps: BoardInteractionDeps,
  store: StoreAccess,
  walls: readonly WallDto[],
  kind: WallKindDto,
): Promise<void> {
  const changing = walls.filter((wall) => wall.kind !== kind);
  if (store.getState().readOnly || changing.length === 0) return;
  if (kind === 'door' && changing.some(({ shape }) => shape !== 'line')) {
    return store.setState({ notice: ONLY_LINES_BECOME_DOORS });
  }
  const ids = changing.map(({ id }) => id);
  const result = await deps.commands.setWallKinds(deps.scopeOf(), ids, kind);
  if (!result.ok) return sayRefusal(deps, store, result);
  const changes = changing.map((wall) => ({ wallId: wall.id, from: wall.kind, to: kind }));
  deps.recordEdit?.([{ kind: 'wallsKindChanged', changes }]);
}

function sayRefusal(
  deps: BoardInteractionDeps,
  { setState }: StoreAccess,
  result: Extract<BoardCommandResult, { ok: false }>,
): void {
  setState({ notice: deps.describeRefusal(result.failure) });
}
