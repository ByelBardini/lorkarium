import type { AssetDto, AssetPurposeDto } from '@lorkarium/contracts';
import { useEffect, useId } from 'react';
import { animatesImage, imageOfClipboard } from '@/lib/image-file';
import { assetUrlOf, type AssetsApi } from '@/services/assets-api';
import { ImageCropDialog, type CropAreaComponent } from './image-crop/image-crop-dialog';
import { ImageSourceButtons } from './image-source-buttons';
import { useImageSender, type CroppingImageSender } from './use-image-sender';

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
  disabled?: boolean;
  onBusyChange?: (busy: boolean) => void;
  /** The drag-and-zoom area of the crop dialog (photo, cover, banner); a spec passes a fake. */
  cropArea?: CropAreaComponent;
}>;

/** One place to choose an image: the area takes a dropped or pasted (Ctrl+V) file and shows the
 *  chosen one; under it, "Escolher imagem", the bin and the link button. For the campaign photo,
 *  cover and banner a file opens the crop dialog first, and goes only on "Enviar".
 *
 *  Example: `<ImagePicker campaignId={id} purpose="token" assets={assets} value={imageAssetId} onChange={setImage} label="Imagem" />` */
export function ImagePicker(props: ImagePickerProps): React.JSX.Element {
  const { campaignId, purpose, assets, value, onChange, label, onBusyChange } = props;
  const sender = useImageSender({ campaignId, purpose, assets, onSent: onChange });
  useEffect(() => onBusyChange?.(sender.busy), [onBusyChange, sender.busy]);
  const hintId = useId();
  return (
    <fieldset disabled={props.disabled} className="flex flex-col gap-3" aria-busy={sender.busy}>
      <legend className="mb-1 text-[13px] font-medium text-label">{label}</legend>
      <div
        role="group"
        aria-label="Área da imagem"
        aria-describedby={hintId}
        tabIndex={0}
        onPaste={(event) =>
          !props.disabled && sender.sendFile(imageOfClipboard(event.clipboardData))
        }
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          if (!props.disabled) sender.sendFile(imageOfClipboard(event.dataTransfer));
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
          Solte a imagem aqui ou cole com Ctrl+V.{' '}
          {animatesImage(purpose) ? 'PNG, JPEG, WebP ou GIF animado' : 'PNG, JPEG ou WebP'}, até 20
          MB.
        </p>
      </div>
      <ImageSourceButtons
        sender={sender}
        hasImage={value !== null}
        removeLabel={props.removeLabel}
        onRemove={() => onChange(null)}
      />
      <ImageCropStep sender={sender} cropArea={props.cropArea} />
    </fieldset>
  );
}

type ImageCropStepProps = Readonly<{ sender: CroppingImageSender; cropArea?: CropAreaComponent }>;

function ImageCropStep({ sender, cropArea }: ImageCropStepProps): React.JSX.Element | null {
  if (!sender.cropping) return null;
  return (
    <ImageCropDialog
      file={sender.cropping.file}
      purpose={sender.cropping.purpose}
      onConfirm={sender.confirmCrop}
      onCancel={sender.cancelCrop}
      CropArea={cropArea}
    />
  );
}
