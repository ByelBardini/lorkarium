import type { LibraryImageDto } from '@lorkarium/contracts';
import { useCallback, useState, useSyncExternalStore } from 'react';
import { SegmentField } from '@/components/segment-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { MixedLibrary } from '@/lib/library-entries';
import { useDraftField } from '@/lib/use-draft-field';
import { assetUrlOf } from '@/services/assets-api';
import type { ImagePresentationApi } from '@/services/image-presentation-api';
import type { ImagePresentationStore } from '@/stores/image-presentation-store';
import type { StoreApi } from 'zustand/vanilla';
import { DeleteConfirmDialog } from './delete-scene-dialog';
import { ImageViewerModal } from './image-viewer';
import { libraryFailureMessage } from './library-messages';
import type { LibrarySubmit } from './use-library-submit';

export type ImageDetailsProps = Readonly<{
  image: LibraryImageDto;
  library: MixedLibrary;
  campaignId: string;
  isMaster: boolean;
  live: boolean;
  submit: LibrarySubmit;
  presentations: ImagePresentationApi;
  store: StoreApi<ImagePresentationStore> | null;
}>;

/** Image actions never activate a grid or change visibility when presenting. Example: `<ImageDetails {...props} />`. */
export function ImageDetails(props: ImageDetailsProps): React.JSX.Element {
  const { image, live, submit } = props;
  const [preview, setPreview] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [presenting, setPresenting] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const binding = useDraftField({
    confirmed: image.name,
    save: async (draft) => {
      const name = draft.trim();
      if (!name) return false;
      await submit({ intent: 'updateImage', imageId: image.id, changes: { name } });
      return true;
    },
  });
  const present = async (): Promise<void> => {
    setPresenting(true);
    setFailure(null);
    const result = await props.presentations.present(props.campaignId, image.id);
    if (result.ok) props.store?.getState().apply(result.value);
    else {
      setFailure(libraryFailureMessage(result.failure.kind));
      await props.store?.getState().sync();
    }
    setPresenting(false);
  };
  const subscribe = useCallback(
    (listener: () => void) => props.store?.subscribe(listener) ?? (() => undefined),
    [props.store],
  );
  const current = useSyncExternalStore(
    subscribe,
    () => props.store?.getState().presentation?.imageId === image.id,
  );
  return (
    <section
      aria-label="Imagem escolhida"
      className="flex min-h-0 flex-col gap-5 overflow-y-auto border-l border-border bg-panel p-5"
    >
      <img
        src={assetUrlOf(image.asset.id)}
        alt={image.name}
        className="max-h-52 w-full rounded-md object-contain"
      />
      {props.isMaster ? (
        <>
          <label>
            Nome da imagem
            <Input {...binding} disabled={!live} maxLength={60} />
          </label>
          <SegmentField
            legend="Quem vê na biblioteca"
            fill
            value={image.visibility}
            options={[
              { value: 'private', label: 'Privada', disabled: !live },
              { value: 'public', label: 'Pública', disabled: !live },
            ]}
            onChange={(visibility) =>
              void submit({ intent: 'updateImage', imageId: image.id, changes: { visibility } })
            }
          />
          <p className="text-xs text-muted-foreground">
            Mostrar para todos preserva a visibilidade na biblioteca.
          </p>
          <Button disabled={!live || presenting} onClick={() => void present()}>
            {presenting ? 'Mostrando…' : 'Mostrar para todos'}
          </Button>
        </>
      ) : (
        <h2 className="font-display text-xl">{image.name}</h2>
      )}
      <Button variant="outline" onClick={() => setPreview(true)}>
        Abrir
      </Button>
      {props.isMaster && (
        <Button variant="ghost" disabled={!live} onClick={() => setDeleting(true)}>
          Excluir imagem
        </Button>
      )}
      {failure && <p role="alert">{failure}</p>}
      {preview && <ImageViewerModal image={image} onClose={() => setPreview(false)} />}
      {deleting && (
        <DeleteConfirmDialog
          title={`Excluir ${image.name}?`}
          description={
            current
              ? 'A apresentação atual será fechada para todos.'
              : 'A imagem será retirada da biblioteca.'
          }
          onClose={() => setDeleting(false)}
          onConfirm={() => void submit({ intent: 'removeImage', imageId: image.id })}
        />
      )}
    </section>
  );
}
