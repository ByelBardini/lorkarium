import type { ChatSentDto } from '@lorkarium/contracts';
import type { ChatAudience } from './chat-message.bo';

/** Sends a chat message to whoever hears it. Adapter in `server/src/infrastructure/chat-publisher/`. */
export interface ChatPublisherPort {
  /** `chat:sent` to the table's room, or to the chat room of each person (every tab of each). */
  sent(event: ChatSentDto, audience: ChatAudience): void;
}
