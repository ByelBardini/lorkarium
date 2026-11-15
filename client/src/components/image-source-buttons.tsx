import { ImageUpIcon, Link2Icon, Loader2Icon, Trash2Icon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { ImageSender } from './use-image-sender';

export type ImageSourceButtonsProps = Readonly<{
  sender: ImageSender;
  hasImage: boolean;
  /** The name of the button that takes the image away; "Remover imagem" by default. */
  removeLabel?: string;
  onRemove: () => void;
}>;

/** Where an image comes from, in one row: "Escolher imagem" (or "Trocar imagem", "Enviando…" while
 *  it goes), the bin with an image, and the link button, whose "Link da imagem" takes the place of
 *  the file button in the same row. The file input stays mounted, so tests and the e2e find it;
 *  only a refusal adds a line below.
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
        {linking ? (
          <ImageLinkField sender={sender} onDone={() => setLinking(false)} />
        ) : (
          <FileButton
            sender={sender}
            hasImage={hasImage}
            onClick={() => fileInput.current?.click()}
          />
        )}
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
      {linking && sender.busy && (
        <span role="status" className="sr-only">
          Enviando…
        </span>
      )}
      <ImageSendProblem sender={sender} />
    </div>
  );
}

type FileButtonProps = Readonly<{ sender: ImageSender; hasImage: boolean; onClick: () => void }>;

function FileButton({ sender, hasImage, onClick }: FileButtonProps): React.JSX.Element {
  return (
    <Button
      type="button"
      variant="outline"
      className="h-9 flex-1"
      disabled={sender.busy}
      onClick={onClick}
    >
      {sender.busy ? (
        <>
          <Loader2Icon aria-hidden="true" className="animate-spin" />
          <span role="status">Enviando…</span>
        </>
      ) : (
        <>
          <ImageUpIcon aria-hidden="true" />
          {hasImage ? 'Trocar imagem' : 'Escolher imagem'}
        </>
      )}
    </Button>
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
      className={cn('size-9', expanded && 'border-primary/60 bg-accent text-primary')}
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

/** "Link da imagem" with a filled "Usar" (named "Usar link") inside its right end, focused when it opens: Enter uses it
 *  too, Esc gives up. A refused link stays typed, so it can be fixed.
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
    <div className="relative min-w-0 flex-1">
      <Input
        ref={input}
        autoFocus
        type="url"
        inputMode="url"
        aria-label="Link da imagem"
        placeholder="Cole o link da imagem (https://…)"
        className="h-9 w-full pr-[4.5rem] text-[13px]"
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
        size="sm"
        aria-label="Usar link"
        title="Usar link (Enter)"
        className="absolute top-1 right-1 min-w-15"
        disabled={sender.busy || link.trim() === ''}
        onClick={() => void use()}
      >
        {sender.busy ? <Loader2Icon aria-hidden="true" className="animate-spin" /> : 'Usar'}
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
      <ImageSendProblem sender={sender} />
    </>
  );
}

function ImageSendProblem({ sender }: Readonly<{ sender: ImageSender }>) {
  if (!sender.problem) return null;
  return (
    <Alert variant="destructive" className="px-3.5 py-3 text-sm">
      {sender.problem}
    </Alert>
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
