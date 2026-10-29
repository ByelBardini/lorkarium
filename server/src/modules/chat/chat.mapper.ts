import type {
  ChatChannelDto,
  ChatSendCommandDto,
  ChatSentChannelDto,
  ChatSentDto,
  ChatSentSpeakerDto,
} from '@lorkarium/contracts';

export type ChatSentInput = Readonly<{
  command: ChatSendCommandDto;
  messageId: string;
  fromUserId: string;
  speaker: ChatSentSpeakerDto;
  at: string;
}>;

/** The channel as the event names it: a direct conversation carries both people in ascending
 *  order, so both ends file it under the same key.
 *
 *  Example: `toChatSentChannelDto({ kind: 'direct', userId: biaId }, caioId) // userIds: [biaId, caioId]` */
export function toChatSentChannelDto(
  channel: ChatChannelDto,
  senderId: string,
): ChatSentChannelDto {
  if (channel.kind !== 'direct') return channel;
  const { userId } = channel;
  const userIds: [string, string] = senderId < userId ? [senderId, userId] : [userId, senderId];
  return { kind: 'direct', userIds };
}

/** The token speaker with the name read from the grid, never the one the client could send.
 *
 *  Example: `toChatTokenSpeakerDto({ sceneId, tokenId }, 'Lyra')` */
export function toChatTokenSpeakerDto(
  token: Readonly<{ sceneId: string; tokenId: string }>,
  name: string,
): ChatSentSpeakerDto {
  return { kind: 'token', sceneId: token.sceneId, tokenId: token.tokenId, name };
}

/** The `chat:sent` of an accepted command.
 *
 *  Example: `toChatSentDto({ command, messageId, fromUserId, speaker, at })` */
export function toChatSentDto(input: ChatSentInput): ChatSentDto {
  const { command, messageId, fromUserId, speaker, at } = input;
  return {
    campaignId: command.campaignId,
    messageId,
    at,
    fromUserId,
    channel: toChatSentChannelDto(command.channel, fromUserId),
    speaker,
    text: command.text,
  };
}
