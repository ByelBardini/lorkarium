import type { LightDto } from '@lorkarium/contracts';
import type { StoreApi } from 'zustand/vanilla';
import type { LightCone } from '@/services/light-commands';
import type { BoardInteractionDeps, BoardInteractionStore } from './board-interaction-store';

type StoreAccess = Pick<StoreApi<BoardInteractionStore>, 'getState' | 'setState'>;
type ConeChange = Readonly<{ light: LightDto; to: LightCone }>;

/** The panel with lights picked: one `setLightCones` for those whose opening changes, each keeping
 *  where it points and expecting the cone it had; confirmed, one entry on the undo stack.
 *
 *  Example: `await changeLightAnglesOf(deps, store, [torch, brazier], 60)` */
export async function changeLightAnglesOf(
  deps: BoardInteractionDeps,
  store: StoreAccess,
  lights: readonly LightDto[],
  angle: number,
): Promise<void> {
  const changing = lights.filter((light) => light.angle !== angle);
  const changes = changing.map((light) => ({ light, to: { facing: light.facing, angle } }));
  await sendCones(deps, store, changes);
}

/** Where the handle being dragged points the light, for the master only until it is released
 *  (`null`: let go without aiming).
 *
 *  Example: `previewLightAimOf(store, spotlight.id, 270)` */
export function previewLightAimOf(
  store: StoreAccess,
  lightId: string,
  facing: number | null,
): void {
  store.setState({ lightAimPreview: facing === null ? {} : { [lightId]: facing } });
}

/** The handle released: one `setLightCones` with the new facing and the opening it has, expecting
 *  the cone it had; confirmed, on the undo stack; refused, it points back and the line says why.
 *  Released where it already points, nothing.
 *
 *  Example: `await aimLightOf(deps, store, spotlight, 90)` */
export async function aimLightOf(
  deps: BoardInteractionDeps,
  store: StoreAccess,
  light: LightDto,
  facing: number,
): Promise<void> {
  if (light.facing === facing) return previewLightAimOf(store, light.id, null);
  previewLightAimOf(store, light.id, facing);
  await sendCones(deps, store, [{ light, to: { facing, angle: light.angle } }]);
  previewLightAimOf(store, light.id, null);
}

async function sendCones(
  deps: BoardInteractionDeps,
  store: StoreAccess,
  changes: readonly ConeChange[],
): Promise<void> {
  if (store.getState().readOnly || changes.length === 0) return;
  const targets = changes.map(({ light, to }) => ({
    lightId: light.id,
    ...to,
    expect: { facing: light.facing, angle: light.angle },
  }));
  const result = await deps.commands.setLightCones(deps.scopeOf(), targets);
  if (!result.ok) return store.setState({ notice: deps.describeRefusal(result.failure) });
  const recorded = targets.map(({ lightId, facing, angle, expect }) => ({
    lightId,
    from: expect,
    to: { facing, angle },
  }));
  deps.recordEdit?.([{ kind: 'lightConesChanged', changes: recorded }]);
}
