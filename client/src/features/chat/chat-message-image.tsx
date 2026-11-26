import type { ChatImageDto } from '@lorkarium/contracts';
import { ImageOffIcon } from 'lucide-react';
import { useState } from 'react';
import { ImageViewerModal } from '@/features/library/image-viewer';
import { assetUrlOf } from '@/services/assets-api';

export type ChatMessageImageProps = Readonly<{
  image: ChatImageDto;
  /** Who sent it, for the picture's name ("Imagem de Bia"). */
  authorName: string;
}>;

/** The picture of a message: its own size reserved (no jump in the feed), at most 15rem tall, and
 *  a click opens it full screen. Once the server swept it (a day later), "Imagem expirada".
 *
 *  Example: `<ChatMessageImage image={event.image} authorName="Bia" />` */
export function ChatMessageImage({ image, authorName }: ChatMessageImageProps): React.JSX.Element {
  const [expired, setExpired] = useState(false);
  const [open, setOpen] = useState(false);
  const name = `Imagem de ${authorName}`;
  if (expired) {
    return (
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground italic">
        <ImageOffIcon aria-hidden="true" className="size-3.5" />
        Imagem expirada
      </p>
    );
  }
  return (
    <>
      <button
        type="button"
        aria-label={`Abrir ${name.toLowerCase()} em tela cheia`}
        onClick={() => setOpen(true)}
        className="w-fit max-w-full rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <img
          src={assetUrlOf(image.assetId)}
          alt={name}
          width={image.width}
          height={image.height}
          loading="lazy"
          onError={() => setExpired(true)}
          className="h-auto max-h-60 w-auto max-w-full rounded-md object-contain"
        />
      </button>
      {open && (
        <ImageViewerModal
          image={{ name, asset: { id: image.assetId } }}
          description="Imagem enviada no chat"
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
