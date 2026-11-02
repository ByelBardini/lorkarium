import { BOARD_EVENTS, addPlayersAckDto } from '@lorkarium/contracts';
import {
  boardFailureOf,
  type BoardCommandFailure,
  type BoardCommandResult,
  type BoardCommandSender,
  type BoardScope,
} from './board-command-sender';

/** `token:addPlayers` answered: the tokens created and the players skipped. */
export type AddPlayersResult =
  | Readonly<{
      ok: true;
      version: number;
      createdIds: readonly string[];
      skippedMemberIds: readonly string[];
    }>
  | Readonly<{ ok: false; failure: BoardCommandFailure }>;

/** The character commands of an open table (master); each answers with its ack, never throws.
 *
 *  Example: `await commands.linkTokenToCharacter(scope, lyraTokenId, lyraCharacterId)` */
export interface TokenLinkCommands {
  /** The token becomes an instance of the character: it drops its own bars, conditions and
   *  controllers and wears the character's. */
  linkTokenToCharacter(
    scope: BoardScope,
    tokenId: string,
    characterId: string,
  ): Promise<BoardCommandResult>;
  /** The token keeps a copy of what it showed and stops following the character. */
  unlinkTokenFromCharacter(scope: BoardScope, tokenId: string): Promise<BoardCommandResult>;
  /** Puts in the grid a token of each player's character not in it yet, around `center`. */
  addPlayers(
    scope: BoardScope,
    center: Readonly<{ col: number; row: number }>,
  ): Promise<AddPlayersResult>;
}

/** `TokenLinkCommands` over the board command sender.
 *
 *  Example: `new RealtimeTokenLinkCommands(sender).addPlayers(scope, { col: 10, row: 6 })` */
export class RealtimeTokenLinkCommands implements TokenLinkCommands {
  constructor(private readonly sender: BoardCommandSender) {}

  linkTokenToCharacter(
    scope: BoardScope,
    tokenId: string,
    characterId: string,
  ): Promise<BoardCommandResult> {
    return this.sender.send(BOARD_EVENTS.linkTokenToCharacter, scope, { tokenId, characterId });
  }

  unlinkTokenFromCharacter(scope: BoardScope, tokenId: string): Promise<BoardCommandResult> {
    return this.sender.send(BOARD_EVENTS.unlinkTokenFromCharacter, scope, { tokenId });
  }

  async addPlayers(
    scope: BoardScope,
    center: Readonly<{ col: number; row: number }>,
  ): Promise<AddPlayersResult> {
    const answer = await this.sender.ask(BOARD_EVENTS.addPlayers, scope, { center });
    if (!answer.answered) return { ok: false, failure: 'offline' };
    const parsed = addPlayersAckDto.safeParse(answer.ack);
    if (!parsed.success) return { ok: false, failure: 'unexpected' };
    if (!parsed.data.ok) return { ok: false, failure: boardFailureOf(parsed.data.error.code) };
    const { version, createdIds, skippedMemberIds } = parsed.data;
    return { ok: true, version, createdIds, skippedMemberIds };
  }
}
