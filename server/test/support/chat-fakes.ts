import type { ChatSentDto } from '@lorkarium/contracts';
import type { ChatAudience } from '../../src/modules/chat/chat-message.bo';
import type { ChatPublisherPort } from '../../src/modules/chat/chat-publisher.port';

/** Every `chat:sent` handed to the publisher, with the audience it was meant for.
 *
 *  Example: `expect(new ChatPublisherFake().published).toEqual([])` */
export class ChatPublisherFake implements ChatPublisherPort {
  readonly published: Array<Readonly<{ event: ChatSentDto; audience: ChatAudience }>> = [];

  sent(event: ChatSentDto, audience: ChatAudience): void {
    this.published.push({ event, audience });
  }
}
