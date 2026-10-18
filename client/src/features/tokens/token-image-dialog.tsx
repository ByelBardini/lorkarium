import type { TokenDto } from '@lorkarium/contracts';
import { useState } from 'react';
import { ImagePicker } from '@/components/image-picker';
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
import type { AssetsApi } from '@/services/assets-api';
import type { BoardCommandFailure, TableBoardCommands } from '@/services/table-board-commands';

export type TokenImageDialogProps = Readonly<{
  campaignId: string;
  token: TokenDto;
  commands: TableBoardCommands;
  assets: AssetsApi;
  onClose: () => void;
}>;

/** "Imagem de Lyra": whoever controls the token picks its image (or takes it away). Saving sends
 *  the new image alone; the frame and the flips stay as they are.
 *
 *  Example: `{target && <TokenImageDialog campaignId={id} token={target} commands={commands} assets={assets} onClose={close} />}` */
export function TokenImageDialog(props: TokenImageDialogProps): React.JSX.Element {
  const { campaignId, token, commands, assets, onClose } = props;
  const [imageAssetId, setImageAssetId] = useState(token.imageAssetId);
  const [failure, setFailure] = useState<BoardCommandFailure | null>(null);
  const [saving, setSaving] = useState(false);
  const save = async (): Promise<void> => {
    setSaving(true);
    const result = await commands.restyleTokens(campaignId, [token.id], { imageAssetId });
    setSaving(false);
    if (result.ok) return onClose();
    setFailure(result.failure);
  };
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{`Imagem de ${token.name}`}</DialogTitle>
          <DialogDescription>PNG sem fundo fica melhor. Todos na mesa veem.</DialogDescription>
        </DialogHeader>
        <ImagePicker
          campaignId={campaignId}
          purpose="token"
          assets={assets}
          value={imageAssetId}
          onChange={(asset) => setImageAssetId(asset?.id ?? null)}
          label="Imagem do token"
        />
        {failure && (
          <Alert variant="destructive" className="px-3.5 py-3 text-sm">
            {tokenCommandFailureMessage(failure)}
          </Alert>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="button" disabled={saving} aria-busy={saving} onClick={() => void save()}>
            {saving ? 'Salvando…' : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
