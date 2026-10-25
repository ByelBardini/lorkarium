import type { TokenDto } from '@lorkarium/contracts';
import { useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { tokenCommandFailureMessage } from '@/features/board/board-messages';
import type { SceneDistance } from '@/lib/range-form';
import type { AssetsApi } from '@/services/assets-api';
import type {
  BoardCommandFailure,
  BoardScope,
  TableBoardCommands,
} from '@/services/table-board-commands';
import { AuraEditor } from './aura-editor';
import {
  auraFormOf,
  parseAuraForm,
  type AuraFormErrors,
  type AuraFormValues,
} from './aura-form-state';

export type TokenAuraDialogProps = Readonly<{
  /** The grid the token is on. */
  scope: BoardScope;
  token: TokenDto;
  commands: TableBoardCommands;
  assets: AssetsApi;
  /** The scene's cell: the radius is typed in its unit. */
  distance: SceneDistance;
  onClose: () => void;
}>;

/** "Aura de Lyra": whoever controls the token picks its aura (or takes it away) with the same
 *  editor as the master's dialog. Saving restyles that token alone with the new aura.
 *
 *  Example: `{target && <TokenAuraDialog scope={scope} token={target} commands={commands} assets={assets} distance={scene} onClose={close} />}` */
export function TokenAuraDialog(props: TokenAuraDialogProps): React.JSX.Element {
  const { token, onClose } = props;
  const dialog = useTokenAuraDialog(props);
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{`Aura de ${token.name}`}</DialogTitle>
          <DialogDescription>Anda com o token. Todos na mesa veem.</DialogDescription>
        </DialogHeader>
        <AuraEditor
          form={dialog.form}
          errors={dialog.errors}
          distance={props.distance}
          images={{ campaignId: props.scope.campaignId, assets: props.assets }}
          onChange={dialog.setForm}
        />
        {dialog.failure && (
          <Alert variant="destructive" className="px-3.5 py-3 text-sm">
            {tokenCommandFailureMessage(dialog.failure)}
          </Alert>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={dialog.saving}
            aria-busy={dialog.saving}
            onClick={dialog.save}
          >
            {dialog.saving ? 'Salvando…' : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type TokenAuraDialogState = Readonly<{
  form: AuraFormValues;
  setForm: (update: (form: AuraFormValues) => AuraFormValues) => void;
  errors: AuraFormErrors;
  failure: BoardCommandFailure | null;
  saving: boolean;
  save: () => void;
}>;

function useTokenAuraDialog(props: TokenAuraDialogProps): TokenAuraDialogState {
  const { scope, token, commands, distance, onClose } = props;
  const [form, setForm] = useState(() => auraFormOf(token.aura, distance));
  const [errors, setErrors] = useState<AuraFormErrors>({});
  const [failure, setFailure] = useState<BoardCommandFailure | null>(null);
  const [saving, setSaving] = useState(false);
  const send = async (aura: TokenDto['aura']): Promise<void> => {
    setSaving(true);
    const result = await commands.restyleTokens(scope, [token.id], { aura });
    setSaving(false);
    if (result.ok) return onClose();
    setFailure(result.failure);
  };
  const save = (): void => {
    const parsed = parseAuraForm(form, distance);
    setErrors(parsed.ok ? {} : parsed.errors);
    if (parsed.ok) void send(parsed.aura);
  };
  return { form, setForm, errors, failure, saving, save };
}
