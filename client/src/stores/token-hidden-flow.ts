import type { TokenDto } from '@lorkarium/contracts';
import type { StoreApi } from 'zustand/vanilla';
import type { BoardInteractionDeps, BoardInteractionStore } from './board-interaction-store';

type StoreAccess = Pick<StoreApi<BoardInteractionStore>, 'getState' | 'setState'>;

/** What the master's switch reads of a token: who it is and whether the players miss it. */
export type HidingToken = Pick<TokenDto, 'id' | 'name' | 'hidden'>;

/** Hides tokens from the players or shows them again (the master's menu and dock): only the ones
 *  not yet in that state go, in one `setTokensHidden`; confirmed, it is one `tokensHidden` entry on
 *  the undo stack and the status line says it; refused, it says why. Nothing goes while read only.
 *
 *  Example: `await setTokensHiddenOf(deps, store, [wolf, goblin], true)` */
export async function setTokensHiddenOf(
  deps: BoardInteractionDeps,
  store: StoreAccess,
  tokens: readonly HidingToken[],
  hidden: boolean,
): Promise<void> {
  const changing = tokens.filter((token) => token.hidden !== hidden);
  if (store.getState().readOnly || changing.length === 0) return;
  const tokenIds = changing.map(({ id }) => id);
  const result = await deps.commands.setTokensHidden(deps.scopeOf(), tokenIds, hidden);
  if (!result.ok) return store.setState({ notice: deps.describeRefusal(result.failure) });
  deps.recordEdit?.([{ kind: 'tokensHidden', tokenIds, hidden }]);
  store.setState({ notice: hiddenAnnouncement(changing, hidden) });
}

/** What the status line (and the screen reader) says once it is confirmed.
 *
 *  Example: `hiddenAnnouncement([wolf], true) // 'Lobo invisível para os jogadores.'` */
export function hiddenAnnouncement(tokens: readonly HidingToken[], hidden: boolean): string {
  const [only] = tokens;
  if (tokens.length === 1 && only) {
    return `${only.name} ${hidden ? 'invisível' : 'visível'} para os jogadores.`;
  }
  return `${tokens.length} tokens ${hidden ? 'invisíveis' : 'visíveis'} para os jogadores.`;
}
