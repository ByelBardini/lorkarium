import type { TokenBox } from '@lorkarium/game-core';
import type { StoreApi } from 'zustand/vanilla';
import type { TokenResize } from '@/lib/edit-history';
import type { BoardInteractionDeps, BoardInteractionStore } from './board-interaction-store';

type StoreAccess = Pick<StoreApi<BoardInteractionStore>, 'getState' | 'setState'>;

/** Resizes tokens (the handles): the new box shows at once, one command goes for all of them,
 *  and once confirmed it is one entry on the undo stack (with the box each had before). A refusal
 *  puts the box back and says why. Nothing is sent while read only.
 *
 *  Example: `await resizeTokensOf(deps, store, [{ tokenId, from, to }], 'Kael agora ocupa 2 × 1 casas.')` */
export async function resizeTokensOf(
  deps: BoardInteractionDeps,
  store: StoreAccess,
  resizes: readonly TokenResize[],
  announce?: string,
): Promise<void> {
  const { getState, setState } = store;
  if (getState().readOnly || resizes.length === 0) return;
  const resizePreview = Object.fromEntries(resizes.map(({ tokenId, to }) => [tokenId, to]));
  setState({ resizePreview });
  const boxes = resizes.map(({ tokenId, to }) => ({ tokenId, ...to }));
  const result = await deps.commands.resizeTokens(deps.scopeOf(), boxes);
  if (getState().resizePreview === resizePreview) setState({ resizePreview: {} });
  if (!result.ok) return setState({ notice: deps.describeRefusal(result.failure) });
  deps.recordEdit?.([{ kind: 'tokensResized', resizes }]);
  if (announce) setState({ notice: announce });
}

/** The box the handles being dragged give the token, for this viewer only (the others see the
 *  resize once it is released and confirmed). `null` drops the preview.
 *
 *  Example: `previewResize(store, kael.id, { col: 2, row: 3, width: 2, height: 1 })` */
export function previewResize(store: StoreAccess, tokenId: string, box: TokenBox | null): void {
  store.setState({ resizePreview: box === null ? {} : { [tokenId]: box } });
}
