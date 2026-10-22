import type { BoardStateDto, SessionMemberDto, TokenDto } from '@lorkarium/contracts';

export type MainTokenBoard = Pick<BoardStateDto, 'viewer' | 'tokens' | 'mainTokens'>;

/** The token the viewer's dock shows when nothing is selected: their choice while they are still
 *  listed in its control, else the oldest token of the Tokens layer listing them (`tokens` comes
 *  in creation order). The master's power does not count: only being listed does.
 *
 *  Example: `mainTokenIdOf(board) // 'lyra-id' for Bia, null for a master in no control` */
export function mainTokenIdOf(board: MainTokenBoard): string | null {
  return mainTokenIdOfMember(board, board.viewer.userId);
}

/** The main token of any member, by the same rule as the viewer's: the party board shows it on
 *  each player's card.
 *
 *  Example: `mainTokenIdOfMember(board, caio.id) // 'kael-id'` */
export function mainTokenIdOfMember(
  board: Pick<BoardStateDto, 'tokens' | 'mainTokens'>,
  userId: string,
): string | null {
  const listed = board.tokens.filter((token) => isListedIn(token, userId));
  const choice = board.mainTokens.find((main) => main.userId === userId);
  const chosen = listed.find((token) => token.id === choice?.tokenId);
  if (chosen) return chosen.id;
  return listed.find((token) => token.layer === 'tokens')?.id ?? null;
}

/** Whether `userId` is in the control of the token: what choosing it as main takes (the master's
 *  `canControl` does not count).
 *
 *  Example: `isListedIn(lyra, bia.id) // true` */
export function isListedIn(token: Pick<TokenDto, 'controllerIds'>, userId: string): boolean {
  return token.controllerIds.includes(userId);
}

/** A player the master may choose a main token for: listed in its control. */
export type MainTokenPlayer = Readonly<{ userId: string; name: string; isMain: boolean }>;

/** The members listed in the control of `tokenId`, but the viewer (who has "Tornar principal"),
 *  each with whether the token is already their main one. The master's "Tornar principal de".
 *
 *  Example: `mainTokenPlayersOf(board, lyraId, members) // [{ userId, name: 'Bia', isMain: true }]` */
export function mainTokenPlayersOf(
  board: MainTokenBoard,
  tokenId: string,
  members: readonly SessionMemberDto[],
): MainTokenPlayer[] {
  const token = board.tokens.find(({ id }) => id === tokenId);
  if (!token) return [];
  const listed = members.filter(
    ({ userId }) => userId !== board.viewer.userId && isListedIn(token, userId),
  );
  return listed.map(({ userId, name }) => ({
    userId,
    name,
    isMain: isMainOf(board, userId, tokenId),
  }));
}

function isMainOf(board: MainTokenBoard, userId: string, tokenId: string): boolean {
  return mainTokenIdOfMember(board, userId) === tokenId;
}
