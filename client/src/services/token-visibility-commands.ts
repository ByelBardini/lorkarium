import { BOARD_EVENTS } from '@lorkarium/contracts';
import type { BoardCommandResult, BoardCommandSender, BoardScope } from './board-command-sender';

/** The master's command that hides tokens from the players or shows them again; answers with its
 *  ack, never throws.
 *
 *  Example: `await commands.setTokensHidden(scope, [wolfId], true)` */
export interface TokenVisibilityCommands {
  /** Only the masters and each token's controllers keep receiving a hidden token; the others get
   *  it deleted (and created again when it shows). All or nothing, in one version. */
  setTokensHidden(
    scope: BoardScope,
    tokenIds: readonly string[],
    hidden: boolean,
  ): Promise<BoardCommandResult>;
}

/** `TokenVisibilityCommands` over the board command sender (`token:setHiddenMany`).
 *
 *  Example: `new RealtimeTokenVisibilityCommands(sender).setTokensHidden(scope, [wolfId], false)` */
export class RealtimeTokenVisibilityCommands implements TokenVisibilityCommands {
  constructor(private readonly sender: BoardCommandSender) {}

  setTokensHidden(
    scope: BoardScope,
    tokenIds: readonly string[],
    hidden: boolean,
  ): Promise<BoardCommandResult> {
    return this.sender.send(BOARD_EVENTS.setTokensHidden, scope, {
      tokenIds: [...tokenIds],
      hidden,
    });
  }
}
