export type ChatErrorCode =
  | 'CHAT_RECIPIENT_NOT_MEMBER'
  | 'CHAT_RECIPIENT_IS_SENDER'
  | 'CHAT_SENDER_NOT_IN_GROUP'
  | 'CHAT_SPEAKER_NOT_ALLOWED';

/** Where a chat message goes, as the errors name it. */
export type ChatChannelKind = 'whisper' | 'direct' | 'group';

/** Every chat refusal of its own; the chat gateway turns `code` into the ack error. */
export class ChatError extends Error {
  constructor(
    readonly code: ChatErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ChatError';
  }
}

/** A whisper, direct or group recipient who is not at this table: the message would reach no one
 *  there, and naming an outsider must not tell whether that account exists. */
export class ChatRecipientNotMemberError extends ChatError {
  constructor(
    readonly campaignId: string,
    readonly recipientId: string,
  ) {
    super(
      'CHAT_RECIPIENT_NOT_MEMBER',
      `user ${recipientId} is not a member of campaign ${campaignId}; expected a member of the campaign`,
    );
  }
}

/** A whisper or direct message to oneself: the conversation would have one person. */
export class ChatRecipientIsSenderError extends ChatError {
  constructor(
    readonly userId: string,
    readonly kind: Exclude<ChatChannelKind, 'group'>,
  ) {
    super(
      'CHAT_RECIPIENT_IS_SENDER',
      `user ${userId} cannot send a ${kind} message to themselves; expected another member of the campaign`,
    );
  }
}

/** A group message from someone outside the group they name. */
export class ChatSenderNotInGroupError extends ChatError {
  constructor(
    readonly groupId: string,
    readonly userId: string,
  ) {
    super(
      'CHAT_SENDER_NOT_IN_GROUP',
      `user ${userId} is not in chat group ${groupId}; expected the sender among its memberIds`,
    );
  }
}

/** Speaking as a token outside the open Table: a character speaks to the whole table only. */
export class ChatSpeakerNotAllowedError extends ChatError {
  constructor(readonly kind: ChatChannelKind) {
    super(
      'CHAT_SPEAKER_NOT_ALLOWED',
      `speaking as a token is not allowed in a ${kind} message; expected the Table without a whisper, or speaking as oneself`,
    );
  }
}
