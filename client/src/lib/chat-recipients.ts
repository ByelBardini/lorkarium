import type { SessionMemberDto } from '@lorkarium/contracts';
import type { ChatConversationTarget } from './chat-conversations';

/** Nothing is saved: a message to someone offline is lost. `offlineIds` are who would not get
 *  it; `blocked` when that is everyone it is for. */
export type ChatRecipientsCheck = Readonly<{ blocked: boolean; offlineIds: readonly string[] }>;

type RosterEntry = Pick<SessionMemberDto, 'userId' | 'online'>;

const NO_WARNING: ChatRecipientsCheck = { blocked: false, offlineIds: [] };

/** Who of the conversation (the whisper's person, the direct's, the group's other members) is
 *  offline; someone no longer in the roster counts as offline. The Table without a whisper is
 *  never checked: it is said to whoever is there.
 *
 *  Example: `recipientsCheckOf({ kind: 'direct', userId: bia }, null, members, viewerId) // { blocked: true, offlineIds: [bia] }` */
export function recipientsCheckOf(
  target: ChatConversationTarget,
  whisperTo: string | null,
  members: readonly RosterEntry[],
  viewerId: string,
): ChatRecipientsCheck {
  const recipients = recipientIdsOf(target, whisperTo, viewerId);
  if (recipients.length === 0) return NO_WARNING;
  const online = new Set(members.filter((each) => each.online).map((each) => each.userId));
  const offlineIds = recipients.filter((id) => !online.has(id));
  return { blocked: offlineIds.length === recipients.length, offlineIds };
}

/** The people one may open a conversation with or call by `@`: everyone but the viewer,
 *  online first, then by name.
 *
 *  Example: `chatContactsOf(members, viewerId).map((each) => each.name) // ['Caio', 'Bia']` */
export function chatContactsOf<Member extends Pick<SessionMemberDto, 'userId' | 'online' | 'name'>>(
  members: readonly Member[],
  viewerId: string,
): Member[] {
  return members
    .filter((each) => each.userId !== viewerId)
    .sort((a, b) => Number(b.online) - Number(a.online) || a.name.localeCompare(b.name, 'pt-BR'));
}

function recipientIdsOf(
  target: ChatConversationTarget,
  whisperTo: string | null,
  viewerId: string,
): readonly string[] {
  if (target.kind === 'direct') return [target.userId];
  if (target.kind === 'group') return target.memberIds.filter((id) => id !== viewerId);
  return whisperTo === null ? [] : [whisperTo];
}
