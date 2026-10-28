import type { TokenDto } from '@lorkarium/contracts';
import { formBoxIn, type SceneSize, type TokenBox, type TokenSize } from '@lorkarium/game-core';
import type { StoreApi } from 'zustand/vanilla';
import type { BoardInteractionDeps, BoardInteractionStore } from './board-interaction-store';

type StoreAccess = Pick<StoreApi<BoardInteractionStore>, 'getState' | 'setState'>;

/** What a form switch reads of the token: its name, its box and its forms. */
export type ShapeshiftingToken = Pick<
  TokenDto,
  'id' | 'name' | 'col' | 'row' | 'width' | 'height' | 'forms' | 'activeFormId'
>;

/** One switch asked by the menu or the keys 1–8: the token, the form, and the scene its new box
 *  must stay in. */
export type TokenFormSwitch = Readonly<{
  token: ShapeshiftingToken;
  formId: string;
  scene: SceneSize;
}>;

/** Switches a token to one of its forms: the box of the form shows at once (`formBoxIn`, the
 *  server's same rule), one `setTokenForm` goes, and once confirmed it is a `tokenFormChanged`
 *  entry on the undo stack (only from another form: there is no switching back to none) and the
 *  status line says it. The active form, a form it lacks, one that cannot fit the scene, or read
 *  only: nothing goes.
 *
 *  Example: `await setTokenFormOf(deps, store, { token: lyra, formId: wolfId, scene })` */
export async function setTokenFormOf(
  deps: BoardInteractionDeps,
  store: StoreAccess,
  { token, formId, scene }: TokenFormSwitch,
): Promise<void> {
  const form = token.forms.find(({ id }) => id === formId);
  if (store.getState().readOnly || !form || form.id === token.activeFormId) return;
  const box = boxIn(scene, token, form);
  if (!box) return store.setState({ notice: deps.describeRefusal('out_of_scene') });
  const resizePreview = { [token.id]: box };
  store.setState({ resizePreview });
  const result = await deps.commands.setTokenForm(deps.scopeOf(), { tokenId: token.id, formId });
  if (store.getState().resizePreview === resizePreview) store.setState({ resizePreview: {} });
  if (!result.ok) return store.setState({ notice: deps.describeRefusal(result.failure) });
  const from = token.activeFormId;
  if (from) deps.recordEdit?.([{ kind: 'tokenFormChanged', tokenId: token.id, from, to: formId }]);
  store.setState({ notice: `${token.name} agora é ${form.name}.` });
}

// `null` when the form is bigger than the scene (the server refuses it as well).
function boxIn(scene: SceneSize, token: TokenBox, size: TokenSize): TokenBox | null {
  try {
    return formBoxIn(scene, token, size);
  } catch {
    return null;
  }
}
