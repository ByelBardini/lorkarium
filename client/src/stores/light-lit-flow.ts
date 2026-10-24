import type { LightDto } from '@lorkarium/contracts';
import type { StoreApi } from 'zustand/vanilla';
import type { BoardInteractionDeps, BoardInteractionStore } from './board-interaction-store';

type StoreAccess = Pick<StoreApi<BoardInteractionStore>, 'getState' | 'setState'>;

export const LIGHT_PUT_OUT = 'Luz apagada.';
export const LIGHT_LIT = 'Luz acesa.';

/** Lights or puts out map lights (the master's menu or panel): one `setLightsLit`; confirmed, the
 *  status line says what happened, refused it says why. Not on the undo stack: lighting is a game
 *  action, like a door.
 *
 *  Example: `await setLightsLitOf(deps, store, [torch], false)` */
export async function setLightsLitOf(
  deps: BoardInteractionDeps,
  store: StoreAccess,
  lights: readonly LightDto[],
  lit: boolean,
): Promise<void> {
  if (store.getState().readOnly || lights.length === 0) return;
  const ids = lights.map(({ id }) => id);
  const result = await deps.commands.setLightsLit(deps.scopeOf(), ids, lit);
  const said = lit ? LIGHT_LIT : LIGHT_PUT_OUT;
  store.setState({ notice: result.ok ? said : deps.describeRefusal(result.failure) });
}
