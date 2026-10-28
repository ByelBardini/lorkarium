import { TOKEN_FORMS_MAX, type TokenDto, type TokenFormDto } from '@lorkarium/contracts';
import type { StoreApi } from 'zustand/vanilla';
import {
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu';
import type { BoardInteractionStore } from '@/stores/board-interaction-store';
import type { BoardStore } from '@/stores/board-store';
import { useViewerTokenRights } from './table-token-rights';

export const SWITCH_FORM_TITLE = 'Trocar forma';
export const EDIT_FORMS_LABEL = 'Editar formas…';

export type TokenFormItemsProps = Readonly<{
  token: TokenDto;
  board: StoreApi<BoardStore>;
  interaction: StoreApi<BoardInteractionStore>;
  /** "Editar formas…": the token whose dialog opens on the Formas tab. Absent: no such item. */
  onEditForms?: (tokenId: string) => void;
}>;

/** The token menu's "Trocar forma ▸" for whoever controls a token with forms: one radio per form
 *  (the active one checked, the key 1–8 beside the others) that switches to it, and "Editar
 *  formas…" for whoever may edit the token. Nothing without forms or without control.
 *
 *  Example: `<TokenFormItems token={token} board={board} interaction={interaction} onEditForms={open} />` */
export function TokenFormItems(props: TokenFormItemsProps): React.JSX.Element | null {
  const { token, board, interaction, onEditForms } = props;
  const rights = useViewerTokenRights(board);
  if (!token.canControl || token.forms.length === 0) return null;
  const choose = (formId: string): void => {
    const scene = board.getState().board?.scene;
    if (scene) void interaction.getState().setTokenForm({ token, formId, scene });
  };
  const editForms = onEditForms && rights.of(token).edit ? onEditForms : null;
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>{SWITCH_FORM_TITLE}</DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        <FormRadios forms={token.forms} activeFormId={token.activeFormId} onChoose={choose} />
        {editForms && <EditFormsItem onSelect={() => editForms(token.id)} />}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

function EditFormsItem({ onSelect }: Readonly<{ onSelect: () => void }>): React.JSX.Element {
  return (
    <>
      <DropdownMenuSeparator />
      <DropdownMenuItem onSelect={onSelect}>{EDIT_FORMS_LABEL}</DropdownMenuItem>
    </>
  );
}

type FormRadiosProps = Readonly<{
  forms: readonly TokenFormDto[];
  activeFormId: string | null;
  onChoose: (formId: string) => void;
}>;

// The key of a form is its place in the list; the active one needs none.
function FormRadios({ forms, activeFormId, onChoose }: FormRadiosProps): React.JSX.Element {
  return (
    <DropdownMenuRadioGroup value={activeFormId ?? ''}>
      {forms.slice(0, TOKEN_FORMS_MAX).map((form, index) => (
        <DropdownMenuRadioItem key={form.id} value={form.id} onSelect={() => onChoose(form.id)}>
          {form.name}
          {form.id !== activeFormId && <DropdownMenuShortcut>{index + 1}</DropdownMenuShortcut>}
        </DropdownMenuRadioItem>
      ))}
    </DropdownMenuRadioGroup>
  );
}
