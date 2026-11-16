import { Fragment } from 'react';
import { emoteImageUrlOf } from '@/emotes/emote-images';
import type { Emote } from '@/lib/emote-catalog';
import { emotePiecesOf, emotesOnly } from '@/lib/emote-text';
import { cn } from '@/lib/utils';

const SIZE_CLASS = {
  smiley: 'size-[1.375em] align-[-0.32em]',
  meme: 'size-[1.75em] align-[-0.5em]',
  sticker: 'size-10 align-middle',
} as const;

/** A message's text with its codes drawn as pictures (`:)`, `:troll:`); a message of only
 *  pictures draws them bigger. The sent text never changes: each picture keeps its code as `alt`
 *  and `title`, for the screen reader and the hover.
 *
 *  Example: `<p><EmoteText text={event.text} /></p>` */
export function EmoteText({ text }: Readonly<{ text: string }>): React.JSX.Element {
  const pieces = emotePiecesOf(text);
  const sticker = emotesOnly(pieces);
  return (
    <>
      {pieces.map((piece, index) => (
        <Fragment key={index}>
          {piece.kind === 'text' ? (
            piece.text
          ) : (
            <EmoteImage emote={piece.emote} code={piece.code} sticker={sticker} />
          )}
        </Fragment>
      ))}
    </>
  );
}

export type EmoteImageProps = Readonly<{
  emote: Emote;
  code: string;
  sticker: boolean;
  className?: string;
  /** Next to its code already (a list, a labelled button): no name of its own. */
  decorative?: boolean;
}>;

/** One emote's picture, inline with the text around it.
 *
 *  Example: `<EmoteImage emote={SMILEYS[0]} code=":)" sticker={false} />` */
export function EmoteImage({ emote, code, sticker, className, decorative }: EmoteImageProps) {
  return (
    <img
      src={emoteImageUrlOf(emote.id)}
      alt={decorative ? '' : code}
      title={decorative ? undefined : code}
      draggable={false}
      className={cn('mx-px inline-block', SIZE_CLASS[sticker ? 'sticker' : emote.kind], className)}
    />
  );
}
