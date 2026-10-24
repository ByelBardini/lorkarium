import type { EffectAreaDto, EffectAreaShapeDto } from '@lorkarium/contracts';
import type { StoreApi } from 'zustand/vanilla';
import type { EffectAreaReshape } from '@/lib/edit-history';
import { shapeOfEffectArea } from '@/lib/effect-area-shape';
import type { BoardCommandResult } from '@/services/table-board-commands';
import type { BoardInteractionDeps, BoardInteractionStore } from './board-interaction-store';

type StoreAccess = Pick<StoreApi<BoardInteractionStore>, 'getState' | 'setState'>;

/** The shapes the reshaped areas show at once, by id, until the server answers.
 *
 *  Example: `setState({ effectAreaPreview: effectAreaPreviewOf(reshapes) })` */
export function effectAreaPreviewOf(
  reshapes: readonly EffectAreaReshape[],
): Readonly<Record<string, EffectAreaShapeDto>> {
  return Object.fromEntries(reshapes.map(({ effectAreaId, to }) => [effectAreaId, to]));
}

/** One `reshapeEffectAreas` for every area of a move, stretch or turn (no command for none).
 *
 *  Example: `const result = await sendReshapes(deps, reshapes)` */
export async function sendReshapes(
  deps: BoardInteractionDeps,
  reshapes: readonly EffectAreaReshape[],
): Promise<BoardCommandResult | null> {
  if (reshapes.length === 0) return null;
  const sent = reshapes.map(({ effectAreaId, to }) => ({ effectAreaId, shape: to }));
  return deps.commands.reshapeEffectAreas(deps.scopeOf(), sent);
}

/** Reshapes areas on their own (the handles): the preview at once, one command, and the
 *  confirmed reshape is one entry on the undo stack. Refused, the area goes back and the status
 *  line says why; `announce` goes there once confirmed.
 *
 *  Example: `await reshapeEffectAreasOf(deps, store, [{ effectAreaId, from, to }], 'Cone agora tem 4 casas · 6 m.')` */
export async function reshapeEffectAreasOf(
  deps: BoardInteractionDeps,
  store: StoreAccess,
  reshapes: readonly EffectAreaReshape[],
  announce?: string,
): Promise<void> {
  const { getState, setState } = store;
  if (getState().readOnly || reshapes.length === 0) return;
  const effectAreaPreview = { ...getState().effectAreaPreview, ...effectAreaPreviewOf(reshapes) };
  setState({ effectAreaPreview });
  const result = await sendReshapes(deps, reshapes);
  dropPreviewOf(store, reshapes);
  if (!result?.ok) {
    if (result) setState({ notice: deps.describeRefusal(result.failure) });
    return;
  }
  deps.recordEdit?.([{ kind: 'effectAreasReshaped', reshapes }]);
  if (announce) setState({ notice: announce });
}

/** The shape one area shows while its handle is dragged; `null` lets go of it.
 *
 *  Example: `previewEffectArea(store, coneId, grownCone)` */
export function previewEffectArea(
  store: StoreAccess,
  effectAreaId: string,
  shape: EffectAreaShapeDto | null,
): void {
  const preview = { ...store.getState().effectAreaPreview };
  if (shape) preview[effectAreaId] = shape;
  else delete preview[effectAreaId];
  store.setState({ effectAreaPreview: preview });
}

/** The preview the reshapes asked for, dropped once the server answered (a newer one stays).
 *
 *  Example: `dropPreviewOf(store, reshapes)` */
export function dropPreviewOf(store: StoreAccess, reshapes: readonly EffectAreaReshape[]): void {
  const left = { ...store.getState().effectAreaPreview };
  for (const { effectAreaId, to } of reshapes) {
    if (left[effectAreaId] === to) delete left[effectAreaId];
  }
  store.setState({ effectAreaPreview: left });
}

/** Deletes the areas (Delete / Backspace on the selection) in one command; confirmed, they
 *  leave the selection and go on the undo stack with their shapes, to be created again.
 *
 *  Example: `await deleteEffectAreasOf(deps, store, selectedAreas)` */
export async function deleteEffectAreasOf(
  deps: BoardInteractionDeps,
  store: StoreAccess,
  areas: readonly EffectAreaDto[],
): Promise<void> {
  const { getState, setState } = store;
  if (getState().readOnly || areas.length === 0) return;
  const ids = areas.map(({ id }) => id);
  const result = await deps.commands.deleteEffectAreas(deps.scopeOf(), ids);
  if (!result.ok) return setState({ notice: deps.describeRefusal(result.failure) });
  setState({
    selectedEffectAreaIds: getState().selectedEffectAreaIds.filter((id) => !ids.includes(id)),
  });
  const removed = areas.map((area) => ({ id: area.id, shape: shapeOfEffectArea(area) }));
  deps.recordEdit?.([{ kind: 'effectAreasRemoved', effectAreas: removed }]);
}
