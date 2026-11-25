import { Fragment } from 'react';
import { customEmojiImageUrlOf, emoteImageUrlOf } from '@/emotes/emote-images';
import type { CustomEmojiRefDto, Emote } from '@lorkarium/contracts';
import { emotePiecesOf, emotesOnly } from '@/lib/emote-text';
import { cn } from '@/lib/utils';

const SIZE_CLASS = {
  smiley: 'size-[1.375em] align-[-0.32em]',
  meme: 'size-[1.75em] align-[-0.5em]',
  sticker: 'size-10 align-middle',
} as const;

export type EmoteTextProps = Readonly<{
  text: string;
  /** The sender's custom emojis, as the message carries them. */
  customEmojis?: readonly CustomEmojiRefDto[];
}>;

/** A message's text with its codes drawn as pictures (`:)`, `:doge:`, the sender's `:festa:`); a
 *  message of only pictures draws them bigger. The sent text never changes: each picture keeps
 *  its code as `alt` and `title`, for the screen reader and the hover.
 *
 *  Example: `<p><EmoteText text={event.text} customEmojis={event.customEmojis} /></p>` */
export function EmoteText({ text, customEmojis }: EmoteTextProps): React.JSX.Element {
  const pieces = emotePiecesOf(text, customEmojis);
  const sticker = emotesOnly(pieces);
  return (
    <>
      {pieces.map((piece, index) => (
        <Fragment key={index}>
          {piece.kind === 'text' && piece.text}
          {piece.kind === 'emote' && (
            <EmoteImage emote={piece.emote} code={piece.code} sticker={sticker} />
          )}
          {piece.kind === 'custom' && (
            <CustomEmojiImage emojiId={piece.emojiId} code={piece.code} sticker={sticker} />
          )}
        </Fragment>
      ))}
    </>
  );
}

export type CustomEmojiImageProps = Readonly<{
  emojiId: string;
  code: string;
  sticker: boolean;
  className?: string;
  decorative?: boolean;
}>;

/** A custom emoji's picture, at a meme's size (a sticker when the message is only pictures).
 *
 *  Example: `<CustomEmojiImage emojiId={id} code=":festa:" sticker={false} />` */
export function CustomEmojiImage(props: CustomEmojiImageProps): React.JSX.Element {
  const { emojiId, code, sticker, className, decorative } = props;
  return (
    <img
      src={customEmojiImageUrlOf(emojiId)}
      alt={decorative ? '' : code}
      title={decorative ? undefined : code}
      draggable={false}
      className={cn('mx-px inline-block', SIZE_CLASS[sticker ? 'sticker' : 'meme'], className)}
    />
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
