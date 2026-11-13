import type { DmSentDto, DmTypingFromDto } from '@lorkarium/contracts';

/** Sends a direct message or "digitando…" out. Adapter in
 *  `server/src/infrastructure/direct-message-publisher/`. */
export interface DirectMessagePublisherPort {
  /** `dm:sent` to the `user:<id>` rooms of both accounts (every tab of each). */
  sent(event: DmSentDto): void;
  /** `dm:typingFrom` to the recipient's room only. */
  typing(recipientId: string, event: DmTypingFromDto): void;
}
