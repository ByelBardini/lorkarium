import type { CustomEmojiDto } from '@lorkarium/contracts';
import { PencilIcon, Trash2Icon } from 'lucide-react';
import { useState } from 'react';
import { CustomEmojiImage } from '@/components/emote-text';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { customEmojiNameProblem, typedCustomEmojiName } from '@/lib/custom-emoji-text';
import { cn } from '@/lib/utils';

export type CustomEmojiItemProps = Readonly<{
  emoji: CustomEmojiDto;
  onRename: (emojiId: string, name: string) => Promise<boolean>;
  onRemove: (emojiId: string) => Promise<boolean>;
}>;

type Mode = 'view' | 'rename' | 'remove';

/** One tile of the gallery: the picture big, its `:name:` under it, "Inativo" past the plan's
 *  ceiling; renaming and removing (which asks first) show on hover or keyboard focus.
 *
 *  Example: `<CustomEmojiItem emoji={emoji} onRename={rename} onRemove={remove} />` */
export function CustomEmojiItem(props: CustomEmojiItemProps): React.JSX.Element {
  const { emoji } = props;
  const [mode, setMode] = useState<Mode>('view');
  return (
    <li className="group relative flex flex-col items-center gap-2 border border-border bg-card px-2 pt-5 pb-3">
      <CustomEmojiImage
        emojiId={emoji.id}
        code={`:${emoji.name}:`}
        sticker
        className={cn('size-14 object-contain', !emoji.active && 'opacity-40 grayscale')}
      />
      {mode === 'rename' ? (
        <RenameField {...props} onDone={() => setMode('view')} />
      ) : (
        <EmojiName emoji={emoji} />
      )}
      {mode === 'view' && <TileActions name={emoji.name} onMode={setMode} />}
      {mode === 'remove' && <RemoveQuestion {...props} onCancel={() => setMode('view')} />}
    </li>
  );
}

function EmojiName({ emoji }: Readonly<{ emoji: CustomEmojiDto }>): React.JSX.Element {
  return (
    <span className="flex w-full min-w-0 flex-col items-center gap-0.5">
      <span
        title={`:${emoji.name}:`}
        className="w-full truncate text-center font-mono text-[13px] text-label"
      >
        :{emoji.name}:
      </span>
      {!emoji.active && (
        <span className="text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
          Inativo
        </span>
      )}
    </span>
  );
}

// Over the tile's top corner; shown on hover and whenever a button inside has the focus.
function TileActions({ name, onMode }: Readonly<{ name: string; onMode: (mode: Mode) => void }>) {
  return (
    <span className="absolute top-1 right-1 flex opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={`Renomear :${name}:`}
        onClick={() => onMode('rename')}
      >
        <PencilIcon aria-hidden="true" />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={`Apagar :${name}:`}
        onClick={() => onMode('remove')}
      >
        <Trash2Icon aria-hidden="true" />
      </Button>
    </span>
  );
}

function RenameField(props: CustomEmojiItemProps & Readonly<{ onDone: () => void }>) {
  const [name, setName] = useState(props.emoji.name);
  const problem = customEmojiNameProblem(name);
  const save = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    if (problem !== null) return;
    if (name === props.emoji.name || (await props.onRename(props.emoji.id, name))) props.onDone();
  };
  return (
    <form onSubmit={save} className="flex w-full flex-col gap-1.5">
      <Input
        aria-label={`Novo nome de :${props.emoji.name}:`}
        value={name}
        maxLength={32}
        aria-invalid={problem !== null}
        title={problem ?? undefined}
        onChange={(event) => setName(typedCustomEmojiName(event.target.value))}
        onKeyDown={(event) => event.key === 'Escape' && props.onDone()}
        className="h-8 px-2 text-center font-mono text-[13px]"
        autoFocus
      />
      <span className="flex justify-center gap-1">
        <Button type="submit" size="xs" disabled={problem !== null}>
          Salvar
        </Button>
        <Button type="button" size="xs" variant="ghost" onClick={props.onDone}>
          Cancelar
        </Button>
      </span>
    </form>
  );
}

function RemoveQuestion(props: CustomEmojiItemProps & Readonly<{ onCancel: () => void }>) {
  return (
    <span
      role="group"
      aria-label={`Apagar :${props.emoji.name}:?`}
      className="flex justify-center gap-1"
    >
      <Button size="xs" variant="destructive" onClick={() => void props.onRemove(props.emoji.id)}>
        Apagar
      </Button>
      <Button size="xs" variant="ghost" onClick={props.onCancel}>
        Manter
      </Button>
    </span>
  );
}
