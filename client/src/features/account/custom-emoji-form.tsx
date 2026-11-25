import { CUSTOM_EMOJI_MIME_TYPES } from '@lorkarium/contracts';
import { ImageUpIcon, Loader2Icon } from 'lucide-react';
import { useId, useState } from 'react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { customEmojiNameProblem, typedCustomEmojiName } from '@/lib/custom-emoji-text';
import { cn } from '@/lib/utils';

export type CustomEmojiFormProps = Readonly<{
  /** Answers whether the server kept it; on yes the form clears. */
  onCreate: (name: string, picture: File) => Promise<boolean>;
}>;

const PICTURE_ACCEPT = CUSTOM_EMOJI_MIME_TYPES.join(',');

/** "Novo emoji": the name (as typed between colons) and the picture, sent together.
 *
 *  Example: `<CustomEmojiForm onCreate={(name, file) => store.getState().create(name, file)} />` */
export function CustomEmojiForm({ onCreate }: CustomEmojiFormProps): React.JSX.Element {
  const [name, setName] = useState('');
  const [picture, setPicture] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const nameId = useId();
  const problemId = useId();
  const problem = name === '' ? null : customEmojiNameProblem(name);
  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    if (picture === null || problem !== null || name === '') return;
    setSending(true);
    const kept = await onCreate(name, picture);
    setSending(false);
    if (!kept) return;
    setName('');
    setPicture(null);
  };
  return (
    <form aria-label="Novo emoji" onSubmit={submit} className="flex flex-wrap items-end gap-3">
      <NameField id={nameId} problemId={problemId} name={name} problem={problem} onName={setName} />
      <PictureButton picture={picture} onPicture={setPicture} />
      <Button
        type="submit"
        disabled={sending || picture === null || name === '' || problem !== null}
      >
        {sending && <Loader2Icon aria-hidden="true" className="animate-spin" />}
        {sending ? 'Enviando…' : 'Adicionar'}
      </Button>
      {problem !== null && (
        <p id={problemId} role="alert" className="w-full text-sm text-destructive">
          {problem}
        </p>
      )}
    </form>
  );
}

type NameFieldProps = Readonly<{
  id: string;
  problemId: string;
  name: string;
  problem: string | null;
  onName: (name: string) => void;
}>;

function NameField({ id, problemId, name, problem, onName }: NameFieldProps): React.JSX.Element {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>Nome</Label>
      <div className="flex items-center gap-1 font-mono text-sm">
        <span aria-hidden="true">:</span>
        <Input
          id={id}
          value={name}
          maxLength={32}
          placeholder="festa"
          aria-invalid={problem !== null}
          aria-describedby={problem !== null ? problemId : undefined}
          onChange={(event) => onName(typedCustomEmojiName(event.target.value))}
          className="w-44"
        />
        <span aria-hidden="true">:</span>
      </div>
    </div>
  );
}

type PictureButtonProps = Readonly<{
  picture: File | null;
  onPicture: (picture: File | null) => void;
}>;

function PictureButton({ picture, onPicture }: PictureButtonProps): React.JSX.Element {
  return (
    <label
      className={cn(
        buttonVariants({ variant: 'outline' }),
        'max-w-64 cursor-pointer has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring',
      )}
    >
      <ImageUpIcon aria-hidden="true" />
      <span className="truncate">{picture === null ? 'Escolher imagem' : picture.name}</span>
      <input
        type="file"
        accept={PICTURE_ACCEPT}
        className="sr-only"
        onChange={(event) => onPicture(event.target.files?.[0] ?? null)}
      />
    </label>
  );
}
