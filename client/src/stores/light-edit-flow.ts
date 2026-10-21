import type { LightDto } from '@lorkarium/contracts';
import type { StoreApi } from 'zustand/vanilla';
import type { LightColor } from '@/lib/light-color';
import type { LightPoint, LightReach } from '@/services/light-commands';
import type { BoardCommandResult } from '@/services/table-board-commands';
import type { BoardInteractionDeps, BoardInteractionStore } from './board-interaction-store';

type StoreAccess = Pick<StoreApi<BoardInteractionStore>, 'getState' | 'setState'>;

/** Where this viewer drags a light, shown at once until the server answers (`null`: let go). */
export function previewLightOf(
  store: StoreAccess,
  lightId: string,
  point: LightPoint | null,
): void {
  const previews = Object.entries(store.getState().lightPreview);
  const others = Object.fromEntries(previews.filter(([id]) => id !== lightId));
  store.setState({ lightPreview: point ? { ...others, [lightId]: point } : others });
}

/** The light dropped: one `moveLights` expecting it where it was; confirmed, the move goes on the
 *  undo stack; refused, it goes back and the status line says why. Dropped where it was, nothing.
 *
 *  Example: `await moveLightOf(deps, store, torch, { x: 7, y: 5.5 })` */
export async function moveLightOf(
  deps: BoardInteractionDeps,
  store: StoreAccess,
  light: LightDto,
  to: LightPoint,
): Promise<void> {
  const from = { x: light.x, y: light.y };
  if (store.getState().readOnly || (from.x === to.x && from.y === to.y)) {
    return previewLightOf(store, light.id, null);
  }
  previewLightOf(store, light.id, to);
  const move = { lightId: light.id, ...to, expect: from };
  const result = await deps.commands.moveLights(deps.campaignId, [move]);
  previewLightOf(store, light.id, null);
  if (!result.ok) return sayRefusal(deps, store, result);
  deps.recordEdit?.([{ kind: 'lightsMoved', moves: [{ lightId: light.id, from, to }] }]);
}

/** The panel with lights picked: one `setLightRanges` for those whose reach changes, each
 *  expecting the reach it had; confirmed, one entry on the undo stack.
 *
 *  Example: `await changeLightRangesOf(deps, store, [torch, brazier], { bright: 6, dim: 6 })` */
export async function changeLightRangesOf(
  deps: BoardInteractionDeps,
  store: StoreAccess,
  lights: readonly LightDto[],
  to: LightReach,
): Promise<void> {
  const changing = lights.filter(({ bright, dim }) => bright !== to.bright || dim !== to.dim);
  if (store.getState().readOnly || changing.length === 0) return;
  const changes = changing.map(({ id, bright, dim }) => ({
    lightId: id,
    ...to,
    expect: { bright, dim },
  }));
  const result = await deps.commands.setLightRanges(deps.campaignId, changes);
  if (!result.ok) return sayRefusal(deps, store, result);
  const recorded = changes.map(({ lightId, expect }) => ({ lightId, from: expect, to }));
  deps.recordEdit?.([{ kind: 'lightRangesChanged', changes: recorded }]);
}

/** The panel with lights picked: one `setLightColors` for those whose color changes, each
 *  expecting the color it had; confirmed, one entry on the undo stack.
 *
 *  Example: `await changeLightColorsOf(deps, store, [torch, brazier], 'moon')` */
export async function changeLightColorsOf(
  deps: BoardInteractionDeps,
  store: StoreAccess,
  lights: readonly LightDto[],
  to: LightColor,
): Promise<void> {
  const changing = lights.filter(({ color }) => color !== to);
  if (store.getState().readOnly || changing.length === 0) return;
  const changes = changing.map(({ id, color }) => ({ lightId: id, color: to, expect: { color } }));
  const result = await deps.commands.setLightColors(deps.campaignId, changes);
  if (!result.ok) return sayRefusal(deps, store, result);
  const recorded = changes.map(({ lightId, expect }) => ({ lightId, from: expect.color, to }));
  deps.recordEdit?.([{ kind: 'lightColorsChanged', changes: recorded }]);
}

/** Delete on the lights picked: one `deleteLights` expecting each where it is; confirmed, they
 *  leave the selection and go on the undo stack (Ctrl+Z puts them back).
 *
 *  Example: `await deleteLightsOf(deps, store, [torch])` */
export async function deleteLightsOf(
  deps: BoardInteractionDeps,
  store: StoreAccess,
  lights: readonly LightDto[],
): Promise<void> {
  if (store.getState().readOnly || lights.length === 0) return;
  const ids = lights.map(({ id }) => id);
  const expect = lights.map(({ id, x, y }) => ({ lightId: id, x, y }));
  const result = await deps.commands.deleteLights(deps.campaignId, ids, expect);
  if (!result.ok) return sayRefusal(deps, store, result);
  const selected = store.getState().selectedLightIds.filter((id) => !ids.includes(id));
  store.setState({ selectedLightIds: selected });
  const removed = lights.map(({ id, x, y, bright, dim, color, facing, angle }) => ({
    id,
    placement: { x, y, bright, dim, color, facing, angle },
  }));
  deps.recordEdit?.([{ kind: 'lightsRemoved', lights: removed }]);
}

function sayRefusal(
  deps: BoardInteractionDeps,
  store: StoreAccess,
  result: Extract<BoardCommandResult, { ok: false }>,
): void {
  store.setState({ notice: deps.describeRefusal(result.failure) });
}
