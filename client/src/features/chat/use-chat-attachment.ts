import { useRef, useState } from 'react';
import {
  EMPTY_CHAT_ATTACHMENT,
  attachingFile,
  attachingLink,
  attachmentAfterUpload,
  chatImageLinkOf,
  type ChatAttachment,
} from '@/lib/chat-attachment';
import type { AssetsApi, AssetsResult } from '@/services/assets-api';

/** The picture of the message being written and how it changes. */
export type ChatAttachmentControls = Readonly<{
  attachment: ChatAttachment;
  /** A picked, pasted or dropped file: checked here, then sent as a `chat_image`. */
  attachFile: (file: File) => void;
  /** A link pasted in the Ctrl+I field: the server downloads it. */
  attachLink: (text: string) => void;
  remove: () => void;
}>;

/** The composer's picture: each file or link goes to the table as a `chat_image` at once (so the
 *  preview is the kept picture), and only the newest send's answer counts.
 *
 *  Example: `const picture = useChatAttachment(campaignId, deps.assets)` */
export function useChatAttachment(campaignId: string, assets: AssetsApi): ChatAttachmentControls {
  const [attachment, setAttachment] = useState<ChatAttachment>(EMPTY_CHAT_ATTACHMENT);
  const lastUpload = useRef(0);
  const start = (next: ChatAttachment, sending: () => Promise<AssetsResult>): void => {
    setAttachment(next);
    if (next.kind !== 'uploading') return;
    void sending().then((result) =>
      setAttachment((current) => attachmentAfterUpload(current, next.uploadId, result)),
    );
  };
  const nextId = (): number => (lastUpload.current += 1);
  return {
    attachment,
    attachFile: (file) =>
      start(attachingFile(nextId(), file), () => assets.upload(campaignId, file, 'chat_image')),
    attachLink: (text) =>
      start(attachingLink(nextId(), text), () =>
        assets.importLink(campaignId, chatImageLinkOf(text) ?? text, 'chat_image'),
      ),
    remove: () => setAttachment(EMPTY_CHAT_ATTACHMENT),
  };
}

/** The first image file of a paste or a drop, if it carries one (text pastes stay text).
 *
 *  Example: `imageFileOf(event.clipboardData.files)` */
export function imageFileOf(files: FileList | null | undefined): File | null {
  const list = Array.from(files ?? []);
  return list.find((file) => file.type.startsWith('image/')) ?? list[0] ?? null;
}
