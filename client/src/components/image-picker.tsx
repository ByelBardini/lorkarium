import type { AssetDto, AssetPurposeDto } from '@lorkarium/contracts';
import { ImageUp } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { IMAGE_ACCEPT, imageFileProblem, imageOfClipboard } from '@/lib/image-file';
import { assetUrlOf, type AssetsApi, type AssetsResult } from '@/services/assets-api';
import { imageFailureMessage } from './image-picker-messages';

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

/** One place to choose an image: a file, dropped onto the area, pasted (Ctrl+V) or a link the
 *  server downloads. A second file while one is sending is ignored.
 *
 *  Example: `<ImagePicker campaignId={id} purpose="token" assets={assets} value={imageAssetId} onChange={setImage} label="Imagem" />` */
export function ImagePicker(props: ImagePickerProps): React.JSX.Element {
  const { campaignId, purpose, assets, value, onChange, label } = props;
  const removeLabel = props.removeLabel ?? 'Remover imagem';
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [link, setLink] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const hintId = useId();
  const send = async (request: () => Promise<AssetsResult>): Promise<void> => {
    setBusy(true);
    setProblem(null);
    const result = await request();
    setBusy(false);
    if (!result.ok) return setProblem(imageFailureMessage(result.failure));
    setLink('');
    onChange(result.asset);
  };
  const sendFile = (file: File | null | undefined): void => {
    if (!file || busy) return;
    const local = imageFileProblem(file);
    if (local) return setProblem(local);
    void send(() => assets.upload(campaignId, file, purpose));
  };
  const sendLink = (): void => {
    if (busy || link.trim() === '') return;
    void send(() => assets.importLink(campaignId, link.trim(), purpose));
  };
  return (
    <fieldset className="flex flex-col gap-3" aria-busy={busy}>
      <legend className="mb-1 text-[13px] font-medium text-label">{label}</legend>
      {value && (
        <ChosenImage assetId={value} removeLabel={removeLabel} onRemove={() => onChange(null)} />
      )}
      <div
        role="group"
        aria-label="Área da imagem"
        aria-describedby={hintId}
        tabIndex={0}
        onPaste={(event) => sendFile(imageOfClipboard(event.clipboardData))}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          sendFile(imageOfClipboard(event.dataTransfer));
        }}
        className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-input bg-card px-3 py-4 text-center outline-none focus-visible:border-primary"
      >
        <p id={hintId} className="text-[13px] text-muted-foreground">
          Solte a imagem aqui ou cole com Ctrl+V. PNG, JPEG ou WebP, até 20 MB.
        </p>
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => fileInput.current?.click()}
        >
          <ImageUp aria-hidden />
          Escolher arquivo
        </Button>
        <input
          ref={fileInput}
          type="file"
          accept={IMAGE_ACCEPT}
          aria-label="Arquivo de imagem"
          className="sr-only"
          tabIndex={-1}
          onChange={(event) => {
            sendFile(event.target.files?.[0]);
            event.target.value = '';
          }}
        />
      </div>
      <LinkField link={link} busy={busy} onChange={setLink} onUse={sendLink} />
      {busy && (
        <p role="status" className="text-[13px] text-muted-foreground">
          Enviando…
        </p>
      )}
      {problem && (
        <Alert variant="destructive" className="px-3.5 py-3 text-sm">
          {problem}
        </Alert>
      )}
    </fieldset>
  );
}

type ChosenImageProps = Readonly<{ assetId: string; removeLabel: string; onRemove: () => void }>;

function ChosenImage(props: ChosenImageProps): React.JSX.Element {
  return (
    <div className="flex items-center gap-3">
      <img
        src={assetUrlOf(props.assetId)}
        alt="Imagem escolhida"
        className="size-16 rounded-md border border-border object-contain"
      />
      <Button type="button" variant="outline" onClick={props.onRemove}>
        {props.removeLabel}
      </Button>
    </div>
  );
}

type LinkFieldProps = Readonly<{
  link: string;
  busy: boolean;
  onChange: (link: string) => void;
  onUse: () => void;
}>;

function LinkField({ link, busy, onChange, onUse }: LinkFieldProps): React.JSX.Element {
  return (
    <div className="flex gap-2">
      <Input
        type="url"
        inputMode="url"
        aria-label="Link da imagem"
        placeholder="https://…"
        value={link}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== 'Enter') return;
          event.preventDefault();
          onUse();
        }}
      />
      <Button type="button" variant="outline" disabled={busy || link.trim() === ''} onClick={onUse}>
        Usar link
      </Button>
    </div>
  );
}
