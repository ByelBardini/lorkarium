import type { ChatSendCommandDto, ChatSentSpeakerDto } from '@lorkarium/contracts';
import type { ClockPort } from '../auth/clock.port';
import type { CampaignAccessBo } from '../campaigns/campaign-access.bo';
import type { MembershipReader } from '../campaigns/cached-memberships';
import { viewerAccessOf } from '../campaigns/member-access';
import type { GridAudiencePort } from '../pings/grid-audience.port';
import { SceneNotFoundError } from '../scenes/scenes.error';
import { TokenAccessBo } from '../tokens/token-access.bo';
import type { TokensDao } from '../tokens/tokens.dao';
import { TokenNotFoundError } from '../tokens/tokens.error';
import { ChatMessageBo } from './chat-message.bo';
import type { ChatPublisherPort } from './chat-publisher.port';
import { ChatRecipientNotMemberError } from './chat.error';
import { toChatSentDto, toChatTokenSpeakerDto } from './chat.mapper';

export type ChatServiceDeps = Readonly<{
  members: MembershipReader;
  /** Whether the connection has the speaking token's grid open: the proof the grid is of this
   *  table and reachable, without a query. */
  audience: GridAudiencePort;
  tokens: Pick<TokensDao, 'findInScene'>;
  publisher: ChatPublisherPort;
  clock: ClockPort;
  newId: () => string;
}>;

type TokenSpeaker = Readonly<{ sceneId: string; tokenId: string }>;

/** The chat of the table: ephemeral like the dice, so it writes nothing and moves no version. */
export class ChatService {
  constructor(private readonly deps: ChatServiceDeps) {}

  /** Sends a message as the session's user (spectator included) to the Table, a whisper, a
   *  direct conversation or a group; the private ones reach only their people, never the
   *  master. Speaking as a token takes its control (or the master role) and the name is read
   *  from the grid.
   *
   *  Example: `const { messageId } = await chatService.send(user.id, command, socket.id)` */
  async send(
    userId: string,
    command: ChatSendCommandDto,
    connectionId: string,
  ): Promise<{ messageId: string }> {
    const access = await viewerAccessOf(this.deps.members, command.campaignId, userId);
    const message = new ChatMessageBo(userId, command.channel);
    message.requireSpeaker(command.speaker, access);
    const audience = message.audience();
    await this.requireMembers(command.campaignId, message.recipientIds());
    const event = toChatSentDto({
      command,
      messageId: this.deps.newId(),
      fromUserId: userId,
      speaker: await this.speakerOf(access, command, connectionId),
      at: this.deps.clock.now().toISOString(),
    });
    this.deps.publisher.sent(event, audience);
    return { messageId: event.messageId };
  }

  private async requireMembers(campaignId: string, userIds: readonly string[]): Promise<void> {
    const found = await Promise.all(
      userIds.map((userId) => this.deps.members.findMembership(campaignId, userId)),
    );
    const missing = userIds.find((_, index) => found[index] === undefined);
    if (missing !== undefined) throw new ChatRecipientNotMemberError(campaignId, missing);
  }

  private async speakerOf(
    access: CampaignAccessBo,
    command: ChatSendCommandDto,
    connectionId: string,
  ): Promise<ChatSentSpeakerDto> {
    const { speaker } = command;
    if (speaker.kind === 'self') return speaker;
    const name = await this.tokenNameOf(access, speaker, connectionId);
    return toChatTokenSpeakerDto(speaker, name);
  }

  private async tokenNameOf(
    access: CampaignAccessBo,
    { sceneId, tokenId }: TokenSpeaker,
    connectionId: string,
  ): Promise<string> {
    const campaignId = access.campaignIdOf();
    if (!this.deps.audience.reaches(connectionId, campaignId, sceneId)) {
      throw new SceneNotFoundError(campaignId, sceneId, access.userIdOf());
    }
    const row = await this.deps.tokens.findInScene(sceneId, tokenId);
    if (!row) throw new TokenNotFoundError(campaignId, tokenId);
    const { controllerIds } = row;
    new TokenAccessBo(access, { tokenId, controllerIds }).requireControl('speak as');
    return row.token.name;
  }
}
