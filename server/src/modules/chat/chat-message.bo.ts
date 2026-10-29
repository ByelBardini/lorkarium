import type { CampaignAccessBo } from '../campaigns/campaign-access.bo';
import {
  ChatRecipientIsSenderError,
  ChatSenderNotInGroupError,
  ChatSpeakerNotAllowedError,
  type ChatChannelKind,
} from './chat.error';

/** Where a message goes: the Table (a whisper to one member when `whisperTo` is set), a direct
 *  conversation with one person, or a fixed group whose members travel on every message. */
export type ChatChannel =
  | Readonly<{ kind: 'table'; whisperTo: string | null }>
  | Readonly<{ kind: 'direct'; userId: string }>
  | Readonly<{
      kind: 'group';
      groupId: string;
      name: string;
      memberIds: readonly string[];
    }>;

/** Who speaks: oneself, or a token of a grid. */
export type ChatSpeaker =
  Readonly<{ kind: 'self' }> | Readonly<{ kind: 'token'; sceneId: string; tokenId: string }>;

/** Who hears a message: the whole table, or only these people (the sender among them). */
export type ChatAudience =
  Readonly<{ kind: 'table' }> | Readonly<{ kind: 'people'; userIds: readonly string[] }>;

/** The rule of one chat message: who hears it, who must be checked as a member and who may
 *  speak. A whisper, a direct or a group message reaches only its people (the masters do not
 *  hear the others' private talk); a token speaks only on the open Table.
 *
 *  Example: `new ChatMessageBo(user.id, { kind: 'direct', userId: biaId }).audience()` */
export class ChatMessageBo {
  constructor(
    private readonly senderId: string,
    private readonly channel: ChatChannel,
  ) {}

  /** The people who hear it, the sender included; refuses a whisper or direct message to
   *  oneself and a group the sender is not in.
   *
   *  Example: `message.audience() // { kind: 'people', userIds: [anaId, biaId] }` */
  audience(): ChatAudience {
    const { channel, senderId } = this;
    if (channel.kind === 'group') return { kind: 'people', userIds: this.groupMemberIds() };
    const otherId = channel.kind === 'direct' ? channel.userId : channel.whisperTo;
    if (otherId === null) return { kind: 'table' };
    const kind = channel.kind === 'direct' ? 'direct' : 'whisper';
    if (otherId === senderId) throw new ChatRecipientIsSenderError(senderId, kind);
    return { kind: 'people', userIds: [senderId, otherId] };
  }

  /** Everyone but the sender who must be a member of the table for the message to go.
   *
   *  Example: `message.recipientIds() // [biaId]` */
  recipientIds(): readonly string[] {
    const audience = this.audience();
    if (audience.kind === 'table') return [];
    return audience.userIds.filter((userId) => userId !== this.senderId);
  }

  /** Oneself speaks anywhere; a token only on the Table without a whisper, and never by a
   *  spectator, who watches and does not play. Control of the token is checked apart, once it
   *  is read.
   *
   *  Example: `message.requireSpeaker({ kind: 'self' }, access)` */
  requireSpeaker(speaker: ChatSpeaker, access: CampaignAccessBo): void {
    if (speaker.kind === 'self') return;
    if (this.channel.kind !== 'table' || this.channel.whisperTo !== null) {
      throw new ChatSpeakerNotAllowedError(this.kindOf());
    }
    if (access.isSpectator()) access.forbid('speak as a token', 'the player or master role');
  }

  private groupMemberIds(): readonly string[] {
    const { channel, senderId } = this;
    if (channel.kind !== 'group') return [];
    if (channel.memberIds.includes(senderId)) return channel.memberIds;
    throw new ChatSenderNotInGroupError(channel.groupId, senderId);
  }

  private kindOf(): ChatChannelKind {
    return this.channel.kind === 'table' ? 'whisper' : this.channel.kind;
  }
}
