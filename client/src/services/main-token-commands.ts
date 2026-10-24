import { BOARD_EVENTS } from '@lorkarium/contracts';
import type { BoardCommandResult, BoardCommandSender, BoardScope } from './board-command-sender';

/** The main token command of an open table; answers with its ack, never throws.
 *
 *  Example: `await commands.setMainToken(scope, kaelId)` */
export interface MainTokenCommands {
  /** Chooses the token one's dock shows when nothing is selected; it takes being listed in its
   *  control. With `playerId`, the master chooses it for that player. There is no "unset":
   *  choosing another one switches. */
  setMainToken(scope: BoardScope, tokenId: string, playerId?: string): Promise<BoardCommandResult>;
}

/** `MainTokenCommands` over the board command sender.
 *
 *  Example: `new RealtimeMainTokenCommands(sender).setMainToken(scope, lyraId)` */
export class RealtimeMainTokenCommands implements MainTokenCommands {
  constructor(private readonly sender: BoardCommandSender) {}

  setMainToken(scope: BoardScope, tokenId: string, playerId?: string): Promise<BoardCommandResult> {
    return this.sender.send(BOARD_EVENTS.setMainToken, scope, {
      tokenId,
      ...(playerId && { playerId }),
    });
  }
}
