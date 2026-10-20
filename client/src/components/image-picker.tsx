import type { AssetDto, AssetPurposeDto } from '@lorkarium/contracts';
import { useId } from 'react';
import { imageOfClipboard } from '@/lib/image-file';
import { assetUrlOf, type AssetsApi } from '@/services/assets-api';
import { ImageSourceButtons } from './image-source-buttons';
import { useImageSender } from './use-image-sender';

export type ImagePickerProps = Readonly<{
  campaignId: string;
  purpose: AssetPurposeDto;
  assets: AssetsApi;
  /** The asset shown as chosen, or `null` for none. */
  value: string | null;
  /** A new asset once the server kept it, or `null` when the person removed the image. */
  onChange: (asset: AssetDto | null) => void;
  label: string;
  /** The name of the button that takes the image away; "Remover imagem" by default. */
  removeLabel?: string;
}>;

/** One place to choose an image: the area takes a dropped or pasted (Ctrl+V) file and shows the
 *  chosen one; under it, "Escolher imagem", the bin and the link button.
 *
 *  Example: `<ImagePicker campaignId={id} purpose="token" assets={assets} value={imageAssetId} onChange={setImage} label="Imagem" />` */
export function ImagePicker(props: ImagePickerProps): React.JSX.Element {
  const { campaignId, purpose, assets, value, onChange, label } = props;
  const sender = useImageSender({ campaignId, purpose, assets, onSent: onChange });
  const hintId = useId();
  return (
    <fieldset className="flex flex-col gap-3" aria-busy={sender.busy}>
      <legend className="mb-1 text-[13px] font-medium text-label">{label}</legend>
      <div
        role="group"
        aria-label="Área da imagem"
        aria-describedby={hintId}
        tabIndex={0}
        onPaste={(event) => sender.sendFile(imageOfClipboard(event.clipboardData))}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          sender.sendFile(imageOfClipboard(event.dataTransfer));
        }}
        className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-input bg-card px-3 py-4 text-center outline-none focus-visible:border-primary"
      >
        {value && (
          <img
            src={assetUrlOf(value)}
            alt="Imagem escolhida"
            className="size-16 rounded-md border border-border object-contain"
          />
        )}
        <p id={hintId} className="text-[13px] text-muted-foreground">
          Solte a imagem aqui ou cole com Ctrl+V. PNG, JPEG ou WebP, até 20 MB.
        </p>
      </div>
      <ImageSourceButtons
        sender={sender}
        hasImage={value !== null}
        removeLabel={props.removeLabel}
        onRemove={() => onChange(null)}
      />
    </fieldset>
  );
}
