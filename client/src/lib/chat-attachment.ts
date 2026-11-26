import { ASSET_MIME_TYPES, CHAT_IMAGE_MAX_BYTES, assetLinkDto } from '@lorkarium/contracts';
import type { AssetsFailure, AssetsResult } from '@/services/assets-api';

/** The picture a message is ready to carry, with the size the server kept. */
export type ChatAttachmentImage = Readonly<{ assetId: string; width: number; height: number }>;

/** Why a picture was refused before going out: not an image, too big, or not a link. */
export type ChatAttachmentRejection = 'type' | 'size' | 'link';

/** The picture of the message being written. `uploadId` names each send, so the answer of a
 *  replaced or removed one is ignored. The preview is the kept picture itself, once ready. */
export type ChatAttachment =
  | Readonly<{ kind: 'empty' }>
  | Readonly<{ kind: 'rejected'; reason: ChatAttachmentRejection }>
  | Readonly<{ kind: 'uploading'; uploadId: number }>
  | Readonly<{ kind: 'ready'; uploadId: number; image: ChatAttachmentImage }>
  | Readonly<{ kind: 'failed'; failure: AssetsFailure }>;

export const EMPTY_CHAT_ATTACHMENT: ChatAttachment = Object.freeze({ kind: 'empty' });

/** What of a file decides whether it may go: its type and its size in bytes. */
export type ChatImageFile = Readonly<{ type: string; size: number }>;

const ACCEPTED_TYPES: ReadonlySet<string> = new Set(ASSET_MIME_TYPES);

/** The `accept` of the picker: the image types the server keeps. */
export const CHAT_IMAGE_ACCEPT = ASSET_MIME_TYPES.join(',');

/** Why a file cannot go, checked before any byte leaves; `null` when it may.
 *
 *  Example: `chatImageFileProblem({ type: 'text/plain', size: 10 }) // 'type'` */
export function chatImageFileProblem(file: ChatImageFile): ChatAttachmentRejection | null {
  if (!ACCEPTED_TYPES.has(file.type)) return 'type';
  return file.size > CHAT_IMAGE_MAX_BYTES ? 'size' : null;
}

/** The link the server will download, trimmed; `null` when the text is not an http(s) link.
 *
 *  Example: `chatImageLinkOf('  https://x.com/a.png ') // 'https://x.com/a.png'` */
export function chatImageLinkOf(text: string): string | null {
  const parsed = assetLinkDto.safeParse(text);
  return parsed.success ? parsed.data : null;
}

/** A picked, pasted or dropped file: on its way, or refused without a request.
 *
 *  Example: `attachingFile(1, file).kind // 'uploading'` */
export function attachingFile(uploadId: number, file: ChatImageFile): ChatAttachment {
  const reason = chatImageFileProblem(file);
  if (reason !== null) return { kind: 'rejected', reason };
  return { kind: 'uploading', uploadId };
}

/** A pasted link (Ctrl+I): on its way, or refused when it is not an http(s) link.
 *
 *  Example: `attachingLink(2, 'ftp://x').kind // 'rejected'` */
export function attachingLink(uploadId: number, text: string): ChatAttachment {
  if (chatImageLinkOf(text) === null) return { kind: 'rejected', reason: 'link' };
  return { kind: 'uploading', uploadId };
}

/** The attachment once the server answered send `uploadId`; the answer of an older send, or one
 *  that arrives after a removal, leaves `current` as it is.
 *
 *  Example: `attachmentAfterUpload(current, 1, { ok: true, asset }).kind // 'ready'` */
export function attachmentAfterUpload(
  current: ChatAttachment,
  uploadId: number,
  result: AssetsResult,
): ChatAttachment {
  if (current.kind !== 'uploading' || current.uploadId !== uploadId) return current;
  if (!result.ok) return { kind: 'failed', failure: result.failure };
  const { id, width, height } = result.asset;
  const image = { assetId: id, width, height };
  return { kind: 'ready', uploadId, image };
}

/** What `chat:send` cites: the id of a ready picture, `null` otherwise.
 *
 *  Example: `chatImageRefOf(ready) // { assetId }` */
export function chatImageRefOf(attachment: ChatAttachment): Readonly<{ assetId: string }> | null {
  return attachment.kind === 'ready' ? { assetId: attachment.image.assetId } : null;
}

/** Whether the message can go: a ready picture alone, or text with no picture on its way
 *  (a refused or failed one does not hold the text back).
 *
 *  Example: `canSendWith(uploading, 'oi') // false` */
export function canSendWith(attachment: ChatAttachment, text: string): boolean {
  if (attachment.kind === 'uploading') return false;
  if (attachment.kind === 'ready') return true;
  return text.trim() !== '';
}
