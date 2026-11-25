import type { CustomEmojiRefDto } from '@lorkarium/contracts';

/** What the chat and the direct messages ask of the custom emojis: the sender's active ones the
 *  text names, as the sent event carries them. */
export interface CustomEmojiRefsPort {
  refsIn(userId: string, text: string): Promise<CustomEmojiRefDto[]>;
}
