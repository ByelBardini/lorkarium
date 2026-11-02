import type { CampaignInfoDto } from '@lorkarium/contracts';
import {
  canCreateTokens,
  tokenRightsOf,
  type OwnedToken,
  type TableTokenRights,
  type TokenRights,
  type TokenRightsViewer,
} from '@lorkarium/game-core';

/** Both keys off: what a table answers until it says otherwise. */
export const NO_TOKEN_KEYS: TableTokenRights = { create: false, delete: false };

/** A token as its rights read it: its author, its link to a character and who controls it. */
export type RightsToken = OwnedToken;

/** What one viewer may do with tokens on this table, by the game-core rule the server uses. */
export type ViewerTokenRights = Readonly<{
  canCreate: boolean;
  of: (token: RightsToken) => TokenRights;
}>;

/** The keys of the open table: the last `session:campaignUpdated`'s (kept by the open tables
 *  store), or the route's campaign before any arrived. */
export type LiveTokenKeys = Readonly<{ tokenRights: TableTokenRights | null }>;

type CampaignKeys = Pick<CampaignInfoDto, 'playersCreateTokens' | 'playersDeleteTokens'>;

const NOTHING: TokenRights = { edit: false, delete: false };

/** The two token keys of a campaign, as the game-core reads them.
 *
 *  Example: `tableTokenRightsOf(campaign) // { create: true, delete: false }` */
export function tableTokenRightsOf(campaign: CampaignKeys): TableTokenRights {
  return { create: campaign.playersCreateTokens, delete: campaign.playersDeleteTokens };
}

/** The keys in force on an open table: live from the store once a `campaignUpdated` came, the
 *  route's campaign until then (or with no table open).
 *
 *  Example: `liveTableTokenRightsOf(openTable, campaign)` */
export function liveTableTokenRightsOf(
  table: LiveTokenKeys | null,
  campaign: CampaignKeys,
): TableTokenRights {
  return table?.tokenRights ?? tableTokenRightsOf(campaign);
}

/** The viewer's rights over the keys; without a viewer yet (the board still loading), none.
 *
 *  Example: `viewerTokenRightsOf(keys, board.viewer).of(token).edit` */
export function viewerTokenRightsOf(
  keys: TableTokenRights,
  viewer: TokenRightsViewer | null,
): ViewerTokenRights {
  if (!viewer) return { canCreate: false, of: () => NOTHING };
  return {
    canCreate: canCreateTokens(viewer, keys),
    of: (token) => tokenRightsOf(viewer, keys, token),
  };
}

/** Whether a role may create tokens: creating asks only for the role, and the toolbar knows the
 *  role before the board says who the viewer is.
 *
 *  Example: `roleCanCreateTokens('player', { create: true, delete: false }) // true` */
export function roleCanCreateTokens(role: TokenRightsViewer['role'], keys: TableTokenRights) {
  return canCreateTokens({ role, userId: '' }, keys);
}
