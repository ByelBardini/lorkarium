import { TOKEN_NAME_MAX_LENGTH, type TokenDto } from '@lorkarium/contracts';
import { useEffect, useId, useState } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { savedTokenBodyOf } from '@/lib/token-copy';
import { useSavedTokensStore, type SavedTokensStore } from '@/stores/saved-tokens-store';
import { NO_FOLDER_LABEL, savedTokenFailureMessage } from './saved-token-messages';

const NO_FOLDER = 'no-folder';

export type SaveTokenDialogProps = Readonly<{
  token: TokenDto;
  list: StoreApi<SavedTokensStore>;
  onClose: () => void;
}>;

/** "Salvar na minha lista": keeps the token as it is now (bars, size, image, aura, forms) in the
 *  viewer's saved tokens at this table, under a name (the token's, at first) and a folder. The
 *  server's refusal (plan, ceiling, an image gone) stays in the dialog.
 *
 *  Example: `{saving && <SaveTokenDialog token={token} list={savedTokens} onClose={close} />}` */
export function SaveTokenDialog({ token, list, onClose }: SaveTokenDialogProps): React.JSX.Element {
  const id = useId();
  const folders = useSavedTokensStore(list, (state) => state.folders);
  // The folders come with the list: saved from the board before the panel ever opened.
  useEffect(() => {
    if (list.getState().savedTokens === null) list.getState().load();
  }, [list]);
  const [name, setName] = useState(token.name);
  const [folder, setFolder] = useState(NO_FOLDER);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    setBusy(true);
    const folderId = folder === NO_FOLDER ? null : folder;
    const input = { name: name.trim(), folderId, token: savedTokenBodyOf(token) };
    const result = await list.getState().save(input);
    setBusy(false);
    if (result.ok) return onClose();
    setProblem(savedTokenFailureMessage(result.failure));
  };
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={(event) => void submit(event)} aria-busy={busy} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Salvar na minha lista</DialogTitle>
            <DialogDescription>
              Guarda o token como está agora: barras, tamanho, imagem, aura e formas.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-name`}>Nome do token salvo</Label>
            <Input
              id={`${id}-name`}
              value={name}
              maxLength={TOKEN_NAME_MAX_LENGTH}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          {folders.length > 0 && (
            <Select value={folder} onValueChange={setFolder}>
              <SelectTrigger aria-label="Pasta do token salvo">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_FOLDER}>{NO_FOLDER_LABEL}</SelectItem>
                {folders.map(({ id: folderId, name: folderName }) => (
                  <SelectItem key={folderId} value={folderId}>
                    {folderName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {problem !== null && (
            <p role="alert" className="text-sm text-destructive-text">
              {problem}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={busy || name.trim() === ''}>
              Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
