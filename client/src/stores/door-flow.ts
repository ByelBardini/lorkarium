import type { DoorStateDto, WallDto } from '@lorkarium/contracts';
import type { StoreApi } from 'zustand/vanilla';
import type { BoardInteractionDeps, BoardInteractionStore } from './board-interaction-store';

type StoreAccess = Pick<StoreApi<BoardInteractionStore>, 'getState' | 'setState'>;

export const DOOR_IS_LOCKED = 'A porta está trancada.';

const SAID: Readonly<Record<DoorStateDto, string>> = {
  open: 'Porta aberta.',
  closed: 'Porta fechada.',
  locked: 'Porta trancada.',
};

/** A click on a door: closed opens, open closes. A locked door only opens for the master (who
 *  also has the menu to lock and unlock); a player hears it is locked and nothing is sent.
 *
 *  Example: `await toggleDoorOf(deps, store, door)` */
export async function toggleDoorOf(
  deps: BoardInteractionDeps,
  store: StoreAccess,
  door: WallDto,
): Promise<void> {
  const isMaster = store.getState().canChooseLayer;
  if (door.doorState === 'locked' && !isMaster) return store.setState({ notice: DOOR_IS_LOCKED });
  await setDoorOf(deps, store, door, door.doorState === 'open' ? 'closed' : 'open');
}

/** Puts a door in `state` (the master's menu, or a click): one `setDoor`; confirmed, the status
 *  line says what happened, refused it says why. Not on the undo stack: a door is a game action.
 *
 *  Example: `await setDoorOf(deps, store, door, 'locked')` */
export async function setDoorOf(
  deps: BoardInteractionDeps,
  store: StoreAccess,
  door: WallDto,
  state: DoorStateDto,
): Promise<void> {
  if (store.getState().readOnly) return;
  const result = await deps.commands.setDoor(deps.campaignId, door.id, state);
  const notice = result.ok ? SAID[state] : deps.describeRefusal(result.failure);
  store.setState({ notice });
}
