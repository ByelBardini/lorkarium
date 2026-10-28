import type { AssetDto } from '@lorkarium/contracts';
import { ImageUpIcon, Link2Icon, Trash2Icon } from 'lucide-react';
import { useRef, useState } from 'react';
import { ImageLinkField, ImageSendNotice } from '@/components/image-source-buttons';
import { useImageSender, type ImageSender } from '@/components/use-image-sender';
import { Button } from '@/components/ui/button';
import { imageOfClipboard } from '@/lib/image-file';
import { cn } from '@/lib/utils';
import type { AssetsApi } from '@/services/assets-api';
import { TokenFace } from './token-face';

export type FormImageFieldProps = Readonly<{
  campaignId: string;
  assets: AssetsApi;
  imageAssetId: string | null;
  initials: string;
  /** The disc of a round form; a square form shows a square face. */
  round: boolean;
  onChange: (asset: AssetDto | null) => void;
}>;

/** "Imagem da forma": a square tile with the form's disc that takes a click, a dropped or a
 *  pasted file; under it the link and the bin. The link field and the notices span the editor.
 *
 *  Example: `<FormImageField campaignId={id} assets={assets} imageAssetId={form.imageAssetId} initials="LA" onChange={setImage} />` */
export function FormImageField(props: FormImageFieldProps): React.JSX.Element {
  const { campaignId, assets, onChange } = props;
  const sender = useImageSender({ campaignId, purpose: 'token', assets, onSent: onChange });
  const [linking, setLinking] = useState(false);
  return (
    <fieldset className="flex flex-col gap-3 sm:self-center" aria-busy={sender.busy}>
      <legend className="sr-only">Imagem da forma</legend>
      <div className="flex flex-col items-center gap-2">
        <ImageTile {...props} sender={sender} />
        <div className="flex justify-center gap-1.5">
          <TileButton
            label="Usar link de imagem"
            expanded={linking}
            onClick={() => setLinking((open) => !open)}
          >
            <Link2Icon aria-hidden="true" />
          </TileButton>
          {props.imageAssetId && (
            <TileButton label="Remover imagem" onClick={() => onChange(null)}>
              <Trash2Icon aria-hidden="true" />
            </TileButton>
          )}
        </div>
      </div>
      {linking && <ImageLinkField sender={sender} onDone={() => setLinking(false)} />}
      <ImageSendNotice sender={sender} />
    </fieldset>
  );
}

type ImageTileProps = FormImageFieldProps & Readonly<{ sender: ImageSender }>;

// The faint grid behind the disc: the token stands on a board.
const GRID_LINE = 'color-mix(in oklab, var(--color-primary) 10%, transparent)';
const GRID_BACKDROP: React.CSSProperties = {
  backgroundImage: `linear-gradient(${GRID_LINE} 1px, transparent 1px), linear-gradient(90deg, ${GRID_LINE} 1px, transparent 1px)`,
  backgroundSize: '22px 22px',
};

function ImageTile({ sender, imageAssetId, initials, round }: ImageTileProps): React.JSX.Element {
  const fileInput = useRef<HTMLInputElement>(null);
  return (
    <div
      onPaste={(event) => sender.sendFile(imageOfClipboard(event.clipboardData))}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        sender.sendFile(imageOfClipboard(event.dataTransfer));
      }}
      style={GRID_BACKDROP}
      className="relative size-33 shrink-0 overflow-hidden rounded-lg border border-dashed border-input bg-card focus-within:border-primary"
    >
      <button
        type="button"
        disabled={sender.busy}
        onClick={() => fileInput.current?.click()}
        className="group flex size-full flex-col outline-none"
      >
        <span className="grid flex-1 place-items-center">
          <TokenFace
            initials={initials}
            imageAssetId={imageAssetId}
            round={round}
            className={cn(
              'size-20 bg-muted font-display text-xl text-foreground ring-2 ring-label',
              !round && 'rounded-sm',
            )}
          />
        </span>
        <span className="flex items-center justify-center gap-1.5 bg-background/85 py-1.5 text-[11px] font-semibold text-label group-hover:text-foreground">
          <ImageUpIcon aria-hidden="true" className="size-3.5" />
          {imageAssetId ? 'Trocar imagem' : 'Escolher imagem'}
        </span>
      </button>
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
    </div>
  );
}

type TileButtonProps = Readonly<{
  label: string;
  expanded?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}>;

function TileButton({ label, expanded, onClick, children }: TileButtonProps): React.JSX.Element {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      aria-expanded={expanded}
      title={label}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}
