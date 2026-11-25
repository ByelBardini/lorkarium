import type { CustomEmojiDto } from '@lorkarium/contracts';
import { CustomEmojiImage } from '@/components/emote-text';
import { cn } from '@/lib/utils';

export type CustomEmojiPreviewProps = Readonly<{
  /** The name being typed, or the newest emoji's. */
  name: string;
  /** The picture being added (a `blob:` URL), shown before the newest emoji. */
  pictureUrl: string | null;
  newest: CustomEmojiDto | null;
}>;

const PLAN_LADDER = [
  { plan: 'Apoiador', amount: '10 emojis' },
  { plan: 'Narrador', amount: '25 emojis' },
  { plan: 'Lenda', amount: '50 emojis, GIF animado' },
] as const;

/** The aside of "Emojis": how the emoji reads in a message (inline and alone, as a sticker), the
 *  rules in short and what each plan gives.
 *
 *  Example: `<CustomEmojiPreview name="festa" pictureUrl={url} newest={null} />` */
export function CustomEmojiPreview(props: CustomEmojiPreviewProps): React.JSX.Element {
  return (
    <div className="flex flex-col gap-8">
      <ChatSample {...props} />
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
        {PLAN_LADDER.map(({ plan, amount }) => (
          <div key={plan} className="contents">
            <dt className="text-[11px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
              {plan}
            </dt>
            <dd className="text-label">{amount}</dd>
          </div>
        ))}
      </dl>
      <ul className="flex max-w-prose flex-col gap-1.5 text-sm text-muted-foreground">
        <li>Escreva :nome: no chat de qualquer mesa ou numa mensagem privada.</li>
        <li>Só você usa os seus; quem recebe vê a imagem.</li>
        <li>PNG, JPEG, WebP ou GIF até 2 MB, cortada no centro em 128 px.</li>
        <li>Se o plano cair, os mais novos ficam inativos. Nada é apagado.</li>
      </ul>
    </div>
  );
}

function ChatSample({ name, pictureUrl, newest }: CustomEmojiPreviewProps): React.JSX.Element {
  const code = `:${name === '' ? (newest?.name ?? 'festa') : name}:`;
  return (
    <figure className="flex flex-col gap-3">
      <figcaption className="text-[11px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
        Assim aparece no chat
      </figcaption>
      <div className="flex flex-col gap-4 border border-border bg-card p-4">
        <p className="text-sm text-foreground">
          bora pra taverna <SamplePicture code={code} pictureUrl={pictureUrl} newest={newest} />
        </p>
        <SamplePicture code={code} pictureUrl={pictureUrl} newest={newest} sticker />
      </div>
    </figure>
  );
}

type SamplePictureProps = Readonly<{
  code: string;
  pictureUrl: string | null;
  newest: CustomEmojiDto | null;
  sticker?: boolean;
}>;

// The size of the chat: a meme inline, 40 px when the message is only pictures.
function SamplePicture({ code, pictureUrl, newest, sticker = false }: SamplePictureProps) {
  const size = sticker ? 'size-10' : 'size-[1.75em] align-[-0.5em]';
  if (pictureUrl !== null) {
    return <img src={pictureUrl} alt={code} className={cn('inline-block object-contain', size)} />;
  }
  if (newest !== null) {
    return <CustomEmojiImage emojiId={newest.id} code={code} sticker={sticker} />;
  }
  return (
    <span
      aria-hidden="true"
      className={cn('inline-block border border-dashed border-input align-middle', size)}
    />
  );
}
