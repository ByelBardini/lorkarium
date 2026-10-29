import type { ChatSentChannelDto, ChatSentDto, SavedRollDto } from '@lorkarium/contracts';
import { ANA } from './auth-api-fake';
import { VHARN } from './campaigns-api-fake';
import { BIA_AT_TABLE, CAIO_AT_TABLE } from './table-session-fixtures';

export const CHAT_MESSAGE_ID = '3f2e1d0c-9b8a-4765-a432-10fedcba9876';

/** "Os Três" of Ana, Bia and Caio, drawn by Ana. */
export const TRIO_GROUP_ID = '6a5b4c3d-2e1f-4a0b-9c8d-7e6f5a4b3c2d';

/** The `n`-th message id of a long conversation (`n` from 0 to 9999). */
export function chatMessageIdOf(n: number): string {
  return `3f2e1d0c-9b8a-4765-a432-${String(n).padStart(12, '0')}`;
}

/** The channel of a direct conversation, both ids in ascending order as the server sends it.
 *
 *  Example: `directBetween(ANA.id, BIA_AT_TABLE.userId)` */
export function directBetween(first: string, second: string): ChatSentChannelDto {
  const [low, high] = first < second ? [first, second] : [second, first];
  return { kind: 'direct', userIds: [low, high] };
}

/** The group "Os Três" (Ana, Bia, Caio), unless the members are given. */
export function trioGroup(memberIds?: string[]): ChatSentChannelDto {
  return {
    kind: 'group',
    groupId: TRIO_GROUP_ID,
    name: 'Os Três',
    memberIds: memberIds ?? [ANA.id, BIA_AT_TABLE.userId, CAIO_AT_TABLE.userId],
  };
}

/** Bia says "Oi, mesa." to the whole VHARN table, as herself, unless overridden.
 *
 *  Example: `chatSent({ messageId: chatMessageIdOf(2), channel: directBetween(ANA.id, BIA_AT_TABLE.userId) })` */
export function chatSent(overrides: Partial<ChatSentDto> = {}): ChatSentDto {
  return {
    campaignId: VHARN.id,
    messageId: CHAT_MESSAGE_ID,
    at: '2026-10-27T20:00:00.000Z',
    fromUserId: BIA_AT_TABLE.userId,
    channel: { kind: 'table', whisperTo: null },
    speaker: { kind: 'self' },
    text: 'Oi, mesa.',
    ...overrides,
  };
}

/** A saved roll of the `n`-th id (`n` from 0 to 9999), for the `/` commands.
 *
 *  Example: `savedRollOf(1, 'Bola de fogo', '8d6')` */
export function savedRollOf(n: number, name: string, expression = '1d20'): SavedRollDto {
  return {
    id: `5a7e0c1d-2b3f-4a6c-8d9e-${String(n).padStart(12, '0')}`,
    name,
    parts: [{ label: null, expression }],
  };
}
