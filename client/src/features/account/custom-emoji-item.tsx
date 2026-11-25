import type { CustomEmojiDto } from '@lorkarium/contracts';
import { CustomEmojiImage } from '@/components/emote-text';
import { cn } from '@/lib/utils';

export type CustomEmojiItemProps = Readonly<{
  emoji: CustomEmojiDto;
  selected: boolean;
  /** Puts this emoji in the form, to rename or remove it. */
  onSelect: (emoji: CustomEmojiDto) => void;
}>;

/** One tile of the gallery: the picture, its `:name:` and "Inativo" past the plan's ceiling. A
 *  click loads it into the form; the one in the form is ringed in gold.
 *
 *  Example: `<CustomEmojiItem emoji={emoji} selected={false} onSelect={edit} />` */
export function CustomEmojiItem({ emoji, selected, onSelect }: CustomEmojiItemProps) {
  const code = `:${emoji.name}:`;
  return (
    <li>
      <button
        type="button"
        aria-pressed={selected}
        aria-label={`Editar ${code}`}
        title={code}
        onClick={() => onSelect(emoji)}
        className={cn(
          'flex w-full flex-col items-center gap-2 rounded-md px-2 pt-4 pb-2.5 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
          selected ? 'bg-primary/10 outline-1 outline-primary' : 'hover:bg-muted',
        )}
      >
        <CustomEmojiImage
          emojiId={emoji.id}
          code={code}
          sticker
          decorative
          className={cn('size-12 object-contain', !emoji.active && 'opacity-40 grayscale')}
        />
        <span className="w-full truncate text-center font-mono text-xs text-muted-foreground">
          {code}
        </span>
        {!emoji.active && (
          <span className="text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
            Inativo
          </span>
        )}
      </button>
    </li>
  );
}
