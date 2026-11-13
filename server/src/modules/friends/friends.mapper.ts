import type {
  BlockedUserDto,
  FriendDto,
  FriendProfileDto,
  FriendRequestEntryDto,
} from '@lorkarium/contracts';
import { memberColorOf } from '@lorkarium/game-core';
import type { FriendRelationState } from './friend-relation.bo';
import type { RelatedAccountRow, RelationReadingRow } from './friendships.dao';

/** PO → DTO: the public profile of the other account, with the effective color.
 *
 *  Example: `toFriendProfileDto(row).color // the drawn color when the account chose none` */
export function toFriendProfileDto(row: RelatedAccountRow): FriendProfileDto {
  return {
    userId: row.userId,
    username: row.username,
    name: row.name,
    color: memberColorOf(row.userId, row.colorChoice),
    avatarId: row.avatarId,
    plan: row.plan,
    admin: row.role === 'admin',
    lorkariumOwner: row.lorkariumOwner,
  };
}

/** Example: `toFriendDto(row).since // '2026-11-12T20:00:00.000Z'` */
export function toFriendDto(row: RelatedAccountRow): FriendDto {
  return { ...toFriendProfileDto(row), since: row.at.toISOString() };
}

/** A received or sent request: the profile and when it was made.
 *
 *  Example: `toFriendRequestEntryDto(row).at` */
export function toFriendRequestEntryDto(row: RelatedAccountRow): FriendRequestEntryDto {
  return { ...toFriendProfileDto(row), at: row.at.toISOString() };
}

/** Example: `toBlockedUserDto(row).at` */
export function toBlockedUserDto(row: RelatedAccountRow): BlockedUserDto {
  return { ...toFriendProfileDto(row), at: row.at.toISOString() };
}

/** What the DAO read of the pair, as the state of the relation BO.
 *
 *  Example: `toFriendRelationState(anaId, biaId, reading).targetAsked` */
export function toFriendRelationState(
  actorId: string,
  targetId: string,
  reading: RelationReadingRow,
): FriendRelationState {
  return { actorId, targetId, ...reading };
}
