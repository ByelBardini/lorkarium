import {
  createLibraryImageRequestDto,
  type AssetDto,
  type LibraryImageDto,
} from '@lorkarium/contracts';
import { useId, useState } from 'react';
import { ImagePicker } from '@/components/image-picker';
import { SegmentField } from '@/components/segment-field';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import type { AssetsApi } from '@/services/assets-api';
import type { LibraryApi } from '@/services/library-api';
import { libraryFailureMessage } from './library-messages';

export type LibraryImageFormProps = Readonly<{
  campaignId: string;
  folderId: string | null;
  assets: AssetsApi;
  api: LibraryApi;
  live: boolean;
  onSaved: (image: LibraryImageDto) => void;
  onClose: () => void;
}>;

/** Retains an uploaded asset when registration fails. Example: `<LibraryImageForm {...props} />`. */
export function LibraryImageForm(props: LibraryImageFormProps): React.JSX.Element {
  const nameId = useId();
  const [name, setName] = useState('');
  const [asset, setAsset] = useState<AssetDto | null>(null);
  const folderId = props.folderId;
  const [visibility, setVisibility] = useState<'private' | 'public'>('private');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const input = createLibraryImageRequestDto.safeParse({
    name,
    assetId: asset?.id,
    folderId,
    visibility,
  });
  const save = async (): Promise<void> => {
    if (!input.success || !props.live || uploading || saving) return;
    setSaving(true);
    setFailure(null);
    const result = await props.api.createImage(props.campaignId, input.data);
    setSaving(false);
    if (result.ok) props.onSaved(result.value);
    else setFailure(libraryFailureMessage(result.failure.kind));
  };
  return (
    <Dialog open onOpenChange={(open) => !open && !saving && props.onClose()}>
      <DialogContent
        className="max-h-[90svh] overflow-y-auto"
        onEscapeKeyDown={(event) => saving && event.preventDefault()}
      >
        <DialogTitle>Nova imagem</DialogTitle>
        <DialogDescription>Salve uma imagem para consultar ou mostrar à mesa.</DialogDescription>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <label htmlFor={nameId}>Nome da imagem</label>
          <Input
            id={nameId}
            maxLength={60}
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={saving || !props.live}
          />
          <ImagePicker
            campaignId={props.campaignId}
            purpose="library_image"
            assets={props.assets}
            value={asset?.id ?? null}
            onChange={setAsset}
            label="Imagem"
            disabled={saving || !props.live}
            onBusyChange={setUploading}
          />
          <SegmentField
            legend="Quem vê na biblioteca"
            fill
            value={visibility}
            onChange={setVisibility}
            options={[
              { value: 'private', label: 'Privada', disabled: saving || !props.live },
              { value: 'public', label: 'Pública', disabled: saving || !props.live },
            ]}
          />
          {failure && <p role="alert">{failure}</p>}
          <Button type="submit" disabled={!input.success || uploading || saving || !props.live}>
            {saving ? 'Salvando…' : 'Salvar imagem'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
