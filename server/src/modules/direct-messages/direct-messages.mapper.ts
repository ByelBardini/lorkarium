import type { DmSentDto, DmTypingFromDto } from '@lorkarium/contracts';

export type DirectMessage = Readonly<{
  messageId: string;
  fromUserId: string;
  toUserId: string;
  text: string;
  at: Date;
}>;

/** Example: `toDmSentDto({ messageId, fromUserId: anaId, toUserId: biaId, text: 'oi', at })` */
export function toDmSentDto(message: DirectMessage): DmSentDto {
  return { ...message, at: message.at.toISOString() };
}

/** Example: `toDmTypingFromDto(anaId, clock.now()) // { fromUserId: anaId, at: '…' }` */
export function toDmTypingFromDto(fromUserId: string, at: Date): DmTypingFromDto {
  return { fromUserId, at: at.toISOString() };
}
