import { LOOSE_ASSET_GRACE_MS } from '../assets/asset-quota.bo';
import type { AssetPo } from '../assets/assets.po';
import { ChatImageNotFoundError } from './chat.error';

/** What of a stored asset decides whether a message may show it. */
export type ChatImageRow = Pick<
  AssetPo,
  'id' | 'purpose' | 'ownerId' | 'createdAt' | 'width' | 'height'
>;

/** The picture an accepted message carries, with the size read from the database. */
export type ChatImage = Readonly<{ assetId: string; width: number; height: number }>;

/** The rule of a picture cited by `chat:send`: a `chat_image` of this table (the row was read
 *  within it), sent by whoever sends the message, and younger than the sweep's grace — an older
 *  one may already be gone, and a message must not point at nothing.
 *
 *  Example: `new ChatImageBo(assetId, row).requireUsableBy(biaId, clock.now())` */
export class ChatImageBo {
  constructor(
    private readonly assetId: string,
    private readonly row: ChatImageRow | undefined,
  ) {}

  /** The picture as the event carries it, or `CHAT_IMAGE_NOT_FOUND` citing the id and the sender. */
  requireUsableBy(senderId: string, now: Date): ChatImage {
    const { row } = this;
    if (row === undefined || !isFreshChatImageOf(row, senderId, now)) {
      throw new ChatImageNotFoundError(this.assetId, senderId);
    }
    return { assetId: row.id, width: row.width, height: row.height };
  }
}

function isFreshChatImageOf(row: ChatImageRow, senderId: string, now: Date): boolean {
  if (row.purpose !== 'chat_image' || row.ownerId !== senderId) return false;
  return now.getTime() - row.createdAt.getTime() < LOOSE_ASSET_GRACE_MS;
}
