import type { CustomEmojiDto } from '@lorkarium/contracts';
import { CustomEmojiImage } from '@/components/emote-text';

export type OwnEmojiGridProps = Readonly<{
  emojis: readonly CustomEmojiDto[];
  /** Gets the `:name:` of the emoji clicked. */
  onPick: (code: string) => void;
}>;

/** The account's own emojis in the picker's grid, each a button named by its `:name:`.
 *
 *  Example: `<OwnEmojiGrid emojis={active} onPick={insertAtCaret} />` */
export function OwnEmojiGrid({ emojis, onPick }: OwnEmojiGridProps): React.JSX.Element {
  return (
    <div className="grid max-h-60 grid-cols-7 gap-1 overflow-y-auto">
      {emojis.map((emoji) => {
        const code = `:${emoji.name}:`;
        return (
          <button
            key={emoji.id}
            type="button"
            aria-label={code}
            title={code}
            onClick={() => onPick(code)}
            className="grid aspect-square place-items-center rounded-sm hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <CustomEmojiImage
              emojiId={emoji.id}
              code={code}
              sticker={false}
              decorative
              className="size-7"
            />
          </button>
        );
      })}
    </div>
  );
}
