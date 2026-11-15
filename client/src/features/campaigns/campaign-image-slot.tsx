import type { AssetDto, AssetPurposeDto } from '@lorkarium/contracts';
import { Link2Icon, Loader2Icon, Trash2Icon } from 'lucide-react';
import { useRef, useState } from 'react';
import { ImageCropDialog, type CropAreaComponent } from '@/components/image-crop/image-crop-dialog';
import { ImageLinkField } from '@/components/image-source-buttons';
import { Alert } from '@/components/ui/alert';
import { useImageSender, type CroppingImageSender } from '@/components/use-image-sender';
import { imageOfClipboard } from '@/lib/image-file';
import { cn } from '@/lib/utils';
import type { AssetsApi } from '@/services/assets-api';

export type CampaignImageSlotProps = Readonly<{
  campaignId: string;
  purpose: AssetPurposeDto;
  assets: AssetsApi;
  /** The format's own image is set ("Trocar imagem", the bin shows). */
  hasImage: boolean;
  /** The name of the bin ("Usar a capa", "Usar capa desenhada"). */
  removeLabel: string;
  /** The plan locks the slot: nothing goes, the preview stays. */
  disabled: boolean;
  onChange: (asset: AssetDto | null) => void;
  /** What the slot shows: the image in its proportion (the fallback included). */
  preview: React.ReactNode;
  /** The drag-and-zoom area of the crop dialog; a spec passes a fake. */
  cropArea?: CropAreaComponent;
}>;

const OVERLAY_BUTTON =
  'grid size-7 place-items-center rounded-sm bg-background/85 text-foreground outline-offset-2 hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring disabled:hidden';

/** One campaign image as a compact slot: the preview itself is the button that picks a file, a
 *  dropped or pasted (Ctrl+V) file goes too, and the link and the bin sit over the image (shown on
 *  hover and on keyboard focus). A file goes through the crop of its format first.
 *
 *  Example: `<CampaignImageSlot campaignId={id} purpose="campaign_photo" assets={assets} hasImage={false} removeLabel="Usar a capa" disabled={false} onChange={choose} preview={<CampaignCover … />} />` */
export function CampaignImageSlot(props: CampaignImageSlotProps): React.JSX.Element {
  const { campaignId, purpose, assets, onChange } = props;
  const sender = useImageSender({ campaignId, purpose, assets, onSent: onChange });
  const fileInput = useRef<HTMLInputElement>(null);
  const [linking, setLinking] = useState(false);
  const take = (data: Pick<DataTransfer, 'files'> | null): void => {
    if (!props.disabled) sender.sendFile(imageOfClipboard(data));
  };
  return (
    <fieldset disabled={props.disabled} aria-busy={sender.busy} className="flex flex-col gap-2">
      <div
        role="group"
        aria-label="Área da imagem"
        onPaste={(event) => take(event.clipboardData)}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          take(event.dataTransfer);
        }}
        className="group/slot relative overflow-hidden rounded-md ring-1 ring-input transition-shadow ring-inset focus-within:ring-primary hover:ring-primary"
      >
        <SlotButton sender={sender} {...props} onPick={() => fileInput.current?.click()} />
        <div className="absolute top-1.5 right-1.5 flex gap-1 opacity-0 transition-opacity group-focus-within/slot:opacity-100 group-hover/slot:opacity-100 motion-reduce:transition-none">
          <button
            type="button"
            className={cn(OVERLAY_BUTTON, linking && 'text-primary')}
            aria-label="Usar link de imagem"
            aria-expanded={linking}
            title="Usar link de imagem"
            onClick={() => setLinking((open) => !open)}
          >
            <Link2Icon aria-hidden="true" className="size-3.5" />
          </button>
          {props.hasImage && (
            <button
              type="button"
              className={cn(OVERLAY_BUTTON, 'hover:text-destructive-text')}
              aria-label={props.removeLabel}
              title={props.removeLabel}
              onClick={() => onChange(null)}
            >
              <Trash2Icon aria-hidden="true" className="size-3.5" />
            </button>
          )}
        </div>
      </div>
      <input
        ref={fileInput}
        type="file"
        accept={sender.accept}
        aria-label="Arquivo de imagem"
        className="sr-only"
        tabIndex={-1}
        onChange={(event) => {
          sender.sendFile(event.target.files?.[0]);
          event.target.value = '';
        }}
      />
      {linking && <ImageLinkField sender={sender} onDone={() => setLinking(false)} />}
      {sender.problem && (
        <Alert variant="destructive" className="px-3 py-2 text-[13px]">
          {sender.problem}
        </Alert>
      )}
      <SlotCropStep sender={sender} cropArea={props.cropArea} />
    </fieldset>
  );
}

type SlotButtonProps = CampaignImageSlotProps &
  Readonly<{ sender: CroppingImageSender; onPick: () => void }>;

// The whole preview picks a file; while one goes, a veil with the spinner says so.
function SlotButton({ sender, hasImage, preview, onPick }: SlotButtonProps): React.JSX.Element {
  return (
    <button
      type="button"
      disabled={sender.busy}
      onClick={onPick}
      className="block w-full cursor-pointer outline-none disabled:cursor-progress"
    >
      <span className="sr-only">{hasImage ? 'Trocar imagem' : 'Escolher imagem'}</span>
      {preview}
      {sender.busy && (
        <span className="absolute inset-0 flex items-center justify-center gap-2 bg-background/80 text-[13px] font-semibold text-primary">
          <Loader2Icon aria-hidden="true" className="size-4 animate-spin" />
          <span role="status">Enviando…</span>
        </span>
      )}
    </button>
  );
}

type SlotCropStepProps = Readonly<{ sender: CroppingImageSender; cropArea?: CropAreaComponent }>;

function SlotCropStep({ sender, cropArea }: SlotCropStepProps): React.JSX.Element | null {
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
