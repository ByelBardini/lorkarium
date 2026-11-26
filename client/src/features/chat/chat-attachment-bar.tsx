import { XIcon } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import type { ChatAttachment } from '@/lib/chat-attachment';
import { assetUrlOf } from '@/services/assets-api';
import { chatAttachmentProblem } from './chat-messages';

export type ChatAttachmentPreviewProps = Readonly<{
  attachment: ChatAttachment;
  onRemove: () => void;
}>;

/** Above the field: the picture on its way ("Enviando imagem…"), the kept one with "Remover
 *  imagem", or why it was refused. Nothing without a picture.
 *
 *  Example: `<ChatAttachmentPreview attachment={picture.attachment} onRemove={picture.remove} />` */
export function ChatAttachmentPreview({
  attachment,
  onRemove,
}: ChatAttachmentPreviewProps): React.JSX.Element | null {
  if (attachment.kind === 'empty') return null;
  return (
    <div className="flex items-start gap-2 rounded-md border border-border bg-muted/40 p-1.5">
      <AttachmentBody attachment={attachment} />
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Remover imagem"
        title="Remover imagem"
        onClick={onRemove}
        className="ml-auto shrink-0"
      >
        <XIcon aria-hidden="true" />
      </Button>
    </div>
  );
}

function AttachmentBody({ attachment }: Readonly<{ attachment: ChatAttachment }>) {
  if (attachment.kind === 'uploading') {
    return (
      <p role="status" className="py-1 text-xs text-muted-foreground">
        Enviando imagem…
      </p>
    );
  }
  if (attachment.kind === 'ready') {
    return (
      <img
        src={assetUrlOf(attachment.image.assetId)}
        alt="Imagem anexada"
        className="max-h-24 max-w-40 rounded-sm object-contain"
      />
    );
  }
  return (
    <p role="alert" className="py-1 text-xs text-destructive-text">
      {chatAttachmentProblem(attachment)}
    </p>
  );
}

export type ChatImageLinkFieldProps = Readonly<{
  onSubmit: (link: string) => void;
  /** Escape or an empty Enter: closes without attaching. */
  onClose: () => void;
}>;

/** The field Ctrl+I opens: a link to an image, which the server downloads and keeps (the link
 *  itself is never shown to the table).
 *
 *  Example: `<ChatImageLinkField onSubmit={picture.attachLink} onClose={closeLink} />` */
export function ChatImageLinkField({
  onSubmit,
  onClose,
}: ChatImageLinkFieldProps): React.JSX.Element {
  const [link, setLink] = useState('');
  return (
    <input
      type="url"
      aria-label="Link da imagem"
      placeholder="Cole o link de uma imagem e aperte Enter (Esc fecha)"
      // The field opens from Ctrl+I on purpose: the focus goes where the person is about to paste.
      autoFocus
      value={link}
      onChange={(event) => setLink(event.target.value)}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== 'Escape') return;
        event.preventDefault();
        event.stopPropagation();
        if (event.key === 'Enter' && link.trim() !== '') onSubmit(link);
        onClose();
      }}
      className="h-8 rounded-md border border-input bg-card px-2.5 text-sm text-foreground outline-none placeholder:text-placeholder focus:border-primary"
    />
  );
}
