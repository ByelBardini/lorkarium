/** The two table settings that open tokens to players; read on every command, so turning one
 *  off counts from the next command on. */
export interface TableTokenRights {
  create: boolean;
  delete: boolean;
}

/** Who is asking, by role inside the campaign. */
export interface TokenRightsViewer {
  role: 'master' | 'player' | 'spectator';
  userId: string;
}

/** What decides ownership: the author, and the link to a character with who controls it (a
 *  linked token opens to its controllers by control alone, never by the table settings). */
export interface OwnedToken {
  createdBy: string | null;
  characterId: string | null;
  controllerIds: readonly string[];
}

export interface TokenRights {
  edit: boolean;
  delete: boolean;
}

const NO_RIGHTS: TokenRights = { edit: false, delete: false };

/** Whether the viewer may create tokens: the master always, a player with the create setting.
 *
 *  Example: `canCreateTokens({ role: 'player', userId }, { create: true, delete: false }) // true` */
export function canCreateTokens(viewer: TokenRightsViewer, rights: TableTokenRights): boolean {
  if (viewer.role === 'master') return true;
  return viewer.role === 'player' && rights.create;
}

/** What the viewer may do to one token: the master everything; a player edits a linked token
 *  they control (deleting it stays the master's), and on an unlinked token they created each
 *  right sits behind its own setting.
 *
 *  Example: `tokenRightsOf(bia, { create: true, delete: false }, token) // { edit: true, delete: false }` */
export function tokenRightsOf(
  viewer: TokenRightsViewer,
  rights: TableTokenRights,
  token: OwnedToken,
): TokenRights {
  if (viewer.role === 'master') return { edit: true, delete: true };
  if (viewer.role !== 'player') return NO_RIGHTS;
  if (token.characterId !== null)
    return { edit: token.controllerIds.includes(viewer.userId), delete: false };
  if (token.createdBy !== viewer.userId) return NO_RIGHTS;
  return { edit: rights.create, delete: rights.delete };
}
