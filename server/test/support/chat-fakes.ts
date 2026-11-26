import type { ChatSentDto } from '@lorkarium/contracts';
import type { AssetsDao } from '../../src/modules/assets/assets.dao';
import type { AssetPo } from '../../src/modules/assets/assets.po';
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

/** The assets a chat message may cite, by table; records every lookup.
 *
 *  Example: `new ChatImagesFake().with(chatImagePo({ ownerId: BIA_ID }))` */
export class ChatImagesFake implements Pick<AssetsDao, 'findInCampaign'> {
  readonly lookups: Array<Readonly<{ campaignId: string; assetId: string }>> = [];
  private readonly rows: AssetPo[] = [];

  with(row: AssetPo): this {
    this.rows.push(row);
    return this;
  }

  async findInCampaign(campaignId: string, assetId: string): Promise<AssetPo | undefined> {
    this.lookups.push({ campaignId, assetId });
    return this.rows.find((row) => row.campaignId === campaignId && row.id === assetId);
  }
}
