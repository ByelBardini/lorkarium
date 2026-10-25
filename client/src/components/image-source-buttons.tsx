import { ImageUpIcon, Link2Icon, Trash2Icon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { ImageSender } from './use-image-sender';

export type ImageSourceButtonsProps = Readonly<{
  sender: ImageSender;
  hasImage: boolean;
  /** The name of the button that takes the image away; "Remover imagem" by default. */
  removeLabel?: string;
  onRemove: () => void;
}>;

/** Where an image comes from, in one row: "Escolher imagem" (or "Trocar imagem"), the bin with an
 *  image, and the link button that opens "Link da imagem" under the row. The file input stays
 *  mounted, so tests and the e2e find it; "Enviando…" and the refusal come below.
 *
 *  Example: `<ImageSourceButtons sender={sender} hasImage={value !== null} onRemove={clear} />` */
export function ImageSourceButtons(props: ImageSourceButtonsProps): React.JSX.Element {
  const { sender, hasImage, onRemove } = props;
  const removeLabel = props.removeLabel ?? 'Remover imagem';
  const fileInput = useRef<HTMLInputElement>(null);
  const [linking, setLinking] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          className="flex-1"
          disabled={sender.busy}
          onClick={() => fileInput.current?.click()}
        >
          <ImageUpIcon aria-hidden="true" />
          {hasImage ? 'Trocar imagem' : 'Escolher imagem'}
        </Button>
        {hasImage && (
          <SquareButton label={removeLabel} onClick={onRemove}>
            <Trash2Icon aria-hidden="true" />
          </SquareButton>
        )}
        <SquareButton
          label="Usar link de imagem"
          expanded={linking}
          onClick={() => setLinking((open) => !open)}
        >
          <Link2Icon aria-hidden="true" />
        </SquareButton>
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
      <ImageSendNotice sender={sender} />
    </div>
  );
}

type SquareButtonProps = Readonly<{
  label: string;
  expanded?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}>;

function SquareButton({ label, expanded, onClick, children }: SquareButtonProps) {
  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      className="size-9"
      aria-label={label}
      aria-expanded={expanded}
      title={label}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

export type ImageLinkFieldProps = Readonly<{
  sender: ImageSender;
  /** The link was kept, or Esc gave up on it. */
  onDone: () => void;
}>;

/** "Link da imagem" + "Usar link", focused when it opens: Enter uses it too, Esc gives up. A
 *  refused link stays typed, so it can be fixed.
 *
 *  Example: `{linking && <ImageLinkField sender={sender} onDone={() => setLinking(false)} />}` */
export function ImageLinkField({ sender, onDone }: ImageLinkFieldProps): React.JSX.Element {
  const [link, setLink] = useState('');
  const input = useRef<HTMLInputElement>(null);
  useEscapeBefore(input, onDone);
  const use = async (): Promise<void> => {
    if (await sender.sendLink(link)) onDone();
  };
  return (
    <div className="flex gap-2">
      <Input
        ref={input}
        autoFocus
        type="url"
        inputMode="url"
        aria-label="Link da imagem"
        placeholder="https://…"
        className="h-9 min-w-0 flex-1 text-[13px]"
        value={link}
        onChange={(event) => setLink(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== 'Enter') return;
          event.preventDefault();
          void use();
        }}
      />
      <Button
        type="button"
        variant="outline"
        className="h-9"
        disabled={sender.busy || link.trim() === ''}
        onClick={() => void use()}
      >
        Usar link
      </Button>
    </div>
  );
}

/** "Enviando…" while an image goes, and why the last one was refused.
 *
 *  Example: `<ImageSendNotice sender={sender} />` */
export function ImageSendNotice({ sender }: Readonly<{ sender: ImageSender }>) {
  return (
    <>
      {sender.busy && (
        <p role="status" className="text-[13px] text-muted-foreground">
          Enviando…
        </p>
      )}
      {sender.problem && (
        <Alert variant="destructive" className="px-3.5 py-3 text-sm">
          {sender.problem}
        </Alert>
      )}
    </>
  );
}

// A dialog closes on Esc from a capture listener on the document; the window's capture runs first,
// so Esc in the link field closes only the field, not the dialog around it.
function useEscapeBefore(input: React.RefObject<HTMLInputElement | null>, onEscape: () => void) {
  useEffect(() => {
    const listen = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.target !== input.current) return;
      event.stopPropagation();
      onEscape();
    };
    window.addEventListener('keydown', listen, { capture: true });
    return () => window.removeEventListener('keydown', listen, { capture: true });
  }, [input, onEscape]);
}
