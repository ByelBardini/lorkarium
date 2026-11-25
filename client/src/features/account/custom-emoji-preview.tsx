import { ImageIcon } from 'lucide-react';
import { useId } from 'react';
import { UserAvatar } from '@/components/user-avatar';
import type { MemberColorDto } from '@lorkarium/contracts';

/** Who the sample message is from: the account itself. */
export type PreviewAuthor = Readonly<{
  name: string;
  color: MemberColorDto;
  avatarId: string | null;
}>;

export type CustomEmojiPreviewProps = Readonly<{
  author: PreviewAuthor;
  /** The name in the form. */
  name: string;
  /** The picture in the form (chosen, or the one being edited); `null` = nothing to show. */
  pictureUrl: string | null;
}>;

/** The aside of "Emojis": the picture in the form as two messages of the account would show it,
 *  inside a line of text and alone (a sticker). Empty until a picture is chosen or picked.
 *
 *  Example: `<CustomEmojiPreview author={author} name="festa" pictureUrl={url} />` */
export function CustomEmojiPreview(props: CustomEmojiPreviewProps): React.JSX.Element {
  const captionId = useId();
  return (
    <figure aria-labelledby={captionId} className="flex flex-col gap-3">
      <figcaption
        id={captionId}
        className="text-[11px] font-semibold tracking-[0.12em] text-muted-foreground uppercase"
      >
        Assim aparece no chat
      </figcaption>
      {props.pictureUrl === null ? <NothingToShow /> : <SampleMessages {...props} />}
    </figure>
  );
}

function NothingToShow(): React.JSX.Element {
  return (
    <div className="flex items-center gap-3 border border-dashed border-input px-4 py-6 text-sm text-muted-foreground">
      <ImageIcon aria-hidden="true" className="size-5 shrink-0" />
      Escolha uma imagem, ou clique num emoji seu, para ver como ele fica numa mensagem.
    </div>
  );
}

// The chat's own measures: 28 px avatar, 14 px text, a meme at 1.75em, a sticker at 40 px.
function SampleMessages({ author, name, pictureUrl }: CustomEmojiPreviewProps) {
  const code = `:${name === '' ? 'nome' : name}:`;
  const src = pictureUrl ?? '';
  return (
    <div className="flex flex-col gap-1 bg-background px-3 py-4">
      <div className="flex gap-2.5">
        <UserAvatar name={author.name} color={author.color} avatarId={author.avatarId} size="sm" />
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="flex items-baseline gap-2">
            <span className="text-sm font-semibold text-foreground">{author.name}</span>
            <span className="text-xs text-muted-foreground">agora</span>
          </p>
          <p className="text-sm text-foreground">
            bora pra taverna{' '}
            <img src={src} alt={code} className="inline-block size-[1.75em] align-[-0.5em]" />
          </p>
        </div>
      </div>
      <div className="pl-[38px]">
        <img src={src} alt={code} className="size-10 object-contain" />
      </div>
    </div>
  );
}
