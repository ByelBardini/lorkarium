import type { TokenDto } from '@lorkarium/contracts';
import type { Cell } from '@lorkarium/game-core';
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
import { DISCONNECTED_COMMAND, tokenCommandFailureMessage } from '@/features/board/board-messages';
import type {
  BoardCommandFailure,
  BoardCommandResult,
  TableBoardCommands,
  TokenEdit,
} from '@/services/table-board-commands';
import { TokenForm, type TokenPlayer } from './token-form';
import {
  emptyTokenForm,
  parseTokenForm,
  tokenFormOf,
  type TokenFormErrors,
} from './token-form-state';
import { deleteTokenQuestion } from './token-messages';

export type TokenDialogProps = Readonly<{
  campaignId: string;
  /** `null` creates ("Novo token"); a token edits it ("Editar token"). */
  token: TokenDto | null;
  /** Where a new token goes: the cell at the center of the view. */
  placeAt: Cell;
  players: readonly TokenPlayer[];
  commands: TableBoardCommands;
  connected: boolean;
  onClose: () => void;
}>;

/** "Novo token" / "Editar token" (master). Mounted only while open; saving closes on the ack, and
 *  the change itself arrives as the event everyone gets.
 *
 *  Example: `{dialog && <TokenDialog campaignId={id} token={null} placeAt={center} players={players} commands={commands} connected onClose={close} />}` */
export function TokenDialog(props: TokenDialogProps): React.JSX.Element {
  const { token, players, connected, onClose } = props;
  const [form, setForm] = useState(() => (token ? tokenFormOf(token) : emptyTokenForm()));
  const [errors, setErrors] = useState<TokenFormErrors>({});
  const [failure, setFailure] = useState<BoardCommandFailure | null>(null);
  const [saving, setSaving] = useState(false);
  const run = async (send: () => Promise<BoardCommandResult>): Promise<void> => {
    setSaving(true);
    const result = await send();
    setSaving(false);
    if (result.ok) return onClose();
    setFailure(result.failure);
  };
  const save = (): void => {
    const parsed = parseTokenForm(form);
    setErrors(parsed.ok ? {} : parsed.errors);
    if (parsed.ok) void run(() => sendToken(props, parsed.token));
  };
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{token ? 'Editar token' : 'Novo token'}</DialogTitle>
          <DialogDescription>Todos na mesa veem o token na hora.</DialogDescription>
        </DialogHeader>
        <form
          noValidate
          className="flex flex-col gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
        >
          <TokenForm form={form} errors={errors} players={players} onChange={setForm} />
          {failure && (
            <Alert variant="destructive" className="px-3.5 py-3 text-sm">
              {tokenCommandFailureMessage(failure)}
            </Alert>
          )}
          {!connected && (
            <p className="text-[13px] text-muted-foreground">{DISCONNECTED_COMMAND}</p>
          )}
          <DialogFooter className="items-center sm:justify-between">
            {token ? (
              <DeleteToken
                name={token.name}
                disabled={saving || !connected}
                onConfirm={() =>
                  void run(() => props.commands.deleteToken(props.campaignId, token.id))
                }
              />
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving || !connected} aria-busy={saving}>
                {saving ? 'Salvando…' : token ? 'Salvar' : 'Criar token'}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function sendToken(props: TokenDialogProps, edit: TokenEdit): Promise<BoardCommandResult> {
  const { commands, campaignId, token, placeAt } = props;
  if (token) return commands.updateToken(campaignId, token.id, edit);
  return commands.createToken(campaignId, { ...edit, col: placeAt.col, row: placeAt.row });
}

type DeleteTokenProps = Readonly<{ name: string; disabled: boolean; onConfirm: () => void }>;

// Two steps, no modal over the modal: the question replaces the button until answered.
function DeleteToken({ name, disabled, onConfirm }: DeleteTokenProps): React.JSX.Element {
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return (
      <Button
        type="button"
        variant="ghost"
        className="text-destructive-text"
        disabled={disabled}
        onClick={() => setAsking(true)}
      >
        Excluir token
      </Button>
    );
  }
  return (
    <div
      role="group"
      aria-label={deleteTokenQuestion(name)}
      className="flex flex-wrap items-center gap-2"
    >
      <span className="text-sm text-destructive-text">{deleteTokenQuestion(name)}</span>
      <Button type="button" variant="destructive" size="sm" disabled={disabled} onClick={onConfirm}>
        Excluir
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={() => setAsking(false)}>
        Manter
      </Button>
    </div>
  );
}
