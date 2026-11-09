import type { AssetPurposeDto, SceneVisibilityDto } from '@lorkarium/contracts';
import { ImagePicker } from '@/components/image-picker';
import { SegmentField } from '@/components/segment-field';
import type { AssetsApi } from '@/services/assets-api';
import { NameField, NewItemFooter } from './new-item-fields';
import { useImageItemDraft, type ImageItemRequest } from './use-image-item-draft';

export type ImageItemFormProps<Body> = Readonly<{
  campaignId: string;
  folderId: string | null;
  assets: AssetsApi;
  live: boolean;
  onClose: () => void;
  /** The dialog around it cannot close nor change type while the item is being saved. */
  onSavingChange?: (saving: boolean) => void;
  nameMaxLength: number;
  purpose: AssetPurposeDto;
  imageLabel: string;
  /** In the gender of the item: "Privada" for an image, "Privado" for a map. */
  visibilityLabels: Readonly<Record<SceneVisibilityDto, string>>;
  /** The body by the item's DTO; `null` while something is missing. */
  bodyOf: (request: ImageItemRequest) => Body | null;
  /** Registers the item; the answer is the refusal to show (`null` = saved). */
  register: (body: Body) => Promise<string | null>;
}>;

/** The form of a library item born from an uploaded image: name, image and who sees it. A refused
 *  registration keeps the name and the image already sent, so trying again sends no second file.
 *
 *  Example: `<ImageItemForm purpose="library_map" bodyOf={parse} register={send} … />` */
export function ImageItemForm<Body>(props: ImageItemFormProps<Body>): React.JSX.Element {
  const draft = useImageItemDraft(props);
  const body = props.bodyOf(draft.request);
  const off = draft.locked;
  const send = (): void => {
    if (body !== null) void draft.save(() => props.register(body));
  };
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        send();
      }}
    >
      <NameField
        value={draft.name}
        onChange={draft.setName}
        maxLength={props.nameMaxLength}
        disabled={off}
      />
      <ImagePicker
        campaignId={props.campaignId}
        purpose={props.purpose}
        assets={props.assets}
        value={draft.request.assetId ?? null}
        onChange={draft.setAsset}
        label={props.imageLabel}
        disabled={off}
        onBusyChange={draft.setUploading}
      />
      <SegmentField
        legend="Quem vê na biblioteca"
        fill
        value={draft.request.visibility}
        onChange={draft.setVisibility}
        options={[
          { value: 'private', label: props.visibilityLabels.private, disabled: off },
          { value: 'public', label: props.visibilityLabels.public, disabled: off },
        ]}
      />
      {draft.failure && <p role="alert">{draft.failure}</p>}
      <NewItemFooter
        canCreate={body !== null && draft.canSend}
        createLabel={draft.saving ? 'Salvando…' : undefined}
        cancelDisabled={draft.saving}
        onCancel={props.onClose}
      />
    </form>
  );
}
