import type {
  BlockedUserDto,
  DmSentDto,
  FriendDto,
  FriendProfileDto,
  FriendRequestEntryDto,
  FriendsOverviewDto,
  PresenceFriendChangedDto,
} from '@lorkarium/contracts';

export const ME_ID = '7a1c2d3e-4f50-4a61-8b72-9c83d4e5f601';
export const OTHER_ACCOUNT_ID = '7a1c2d3e-4f50-4a61-8b72-9c83d4e5f602';
const AT = '2026-11-12T10:00:00.000Z';

function profile(userId: string, username: string, name: string): FriendProfileDto {
  const color = 'gold';
  return {
    userId,
    username,
    name,
    color,
    avatarId: null,
    plan: 'free',
    admin: false,
    lorkariumOwner: false,
  };
}

export const BIA: FriendDto = {
  ...profile('1b2c3d4e-5f60-4a71-8b82-9c93d4e5f601', 'biaflor', 'Bia'),
  since: AT,
};
export const CAIO: FriendDto = {
  ...profile('1b2c3d4e-5f60-4a71-8b82-9c93d4e5f602', 'caio', 'Caio'),
  since: AT,
};
export const THIAGO_ASKS: FriendRequestEntryDto = {
  ...profile('1b2c3d4e-5f60-4a71-8b82-9c93d4e5f603', 'thiagaum', 'Thiago'),
  at: AT,
};
export const DUDA_ASKED: FriendRequestEntryDto = {
  ...profile('1b2c3d4e-5f60-4a71-8b82-9c93d4e5f604', 'duda', 'Duda'),
  at: AT,
};
export const RUI_BLOCKED: BlockedUserDto = {
  ...profile('1b2c3d4e-5f60-4a71-8b82-9c93d4e5f605', 'rui', 'Rui'),
  at: AT,
};

/** The overview with Bia and Caio as friends, one request each way and Rui blocked. */
export function friendsOverview(changes: Partial<FriendsOverviewDto> = {}): FriendsOverviewDto {
  return {
    friends: [BIA, CAIO],
    incoming: [THIAGO_ASKS],
    outgoing: [DUDA_ASKED],
    blocked: [RUI_BLOCKED],
    ...changes,
  };
}

export function presenceChanged(
  changes: Partial<PresenceFriendChangedDto> = {},
): PresenceFriendChangedDto {
  return { userId: BIA.userId, status: 'online', table: null, at: AT, ...changes };
}

let messageSerial = 0;

/** A `dm:sent` from Bia to me unless told otherwise; each call a new message id. */
export function dmSent(changes: Partial<DmSentDto> = {}): DmSentDto {
  messageSerial += 1;
  const suffix = String(messageSerial).padStart(12, '0');
  return {
    messageId: `2c3d4e5f-6071-4a82-8b93-${suffix}`,
    fromUserId: BIA.userId,
    toUserId: ME_ID,
    text: 'oi',
    at: AT,
    ...changes,
  };
}
