import type { StoreApi } from 'zustand/vanilla';
import type { TokenTurn } from '@/lib/edit-history';
import type { BoardInteractionDeps, BoardInteractionStore } from './board-interaction-store';

type StoreAccess = Pick<StoreApi<BoardInteractionStore>, 'getState' | 'setState'>;

/** Turns tokens (the handle, Q/E): the new facing shows at once, one command goes for all of
 *  them, and once confirmed it is one entry on the undo stack (with where each looked before).
 *  A refusal puts the facing back and says why. Nothing is sent while read only.
 *
 *  Example: `await faceTokensOf(deps, store, [{ tokenId, from: 0, to: 45 }], 'Kael olha para o sudoeste.')` */
export async function faceTokensOf(
  deps: BoardInteractionDeps,
  store: StoreAccess,
  turns: readonly TokenTurn[],
  announce?: string,
): Promise<void> {
  const { getState, setState } = store;
  if (getState().readOnly || turns.length === 0) return;
  const facingPreview = Object.fromEntries(turns.map(({ tokenId, to }) => [tokenId, to]));
  setState({ facingPreview });
  const faces = turns.map(({ tokenId, to }) => ({ tokenId, facing: to }));
  const result = await deps.commands.faceTokens(deps.campaignId, faces);
  if (getState().facingPreview === facingPreview) setState({ facingPreview: {} });
  if (!result.ok) return setState({ notice: deps.describeRefusal(result.failure) });
  deps.recordEdit?.([{ kind: 'tokensFaced', turns }]);
  if (announce) setState({ notice: announce });
}

/** Where the handle being dragged points the token, for this viewer only (the others see the
 *  turn once it is released and confirmed). `null` drops the preview.
 *
 *  Example: `previewFacing(store, kael.id, 90)` */
export function previewFacing(store: StoreAccess, tokenId: string, facing: number | null): void {
  store.setState({ facingPreview: facing === null ? {} : { [tokenId]: facing } });
}
