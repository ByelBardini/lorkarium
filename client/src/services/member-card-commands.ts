import { BOARD_EVENTS, type MemberCardChangesInput } from '@lorkarium/contracts';
import type { BoardCommandResult, BoardCommandSender, BoardScope } from './board-command-sender';

/** The party board card command of an open table; answers with its ack, never throws.
 *
 *  Example: `await commands.updateMemberCard(scope, biaId, { armorClass: 15 })` */
export interface MemberCardCommands {
  /** Changes the card of `memberId`: the member and the masters may. An absent field stays,
   *  `null` (or an empty text) clears it. */
  updateMemberCard(
    scope: BoardScope,
    memberId: string,
    changes: MemberCardChangesInput,
  ): Promise<BoardCommandResult>;
}

/** `MemberCardCommands` over the board command sender.
 *
 *  Example: `new RealtimeMemberCardCommands(sender).updateMemberCard(scope, biaId, { noteOne: 'x' })` */
export class RealtimeMemberCardCommands implements MemberCardCommands {
  constructor(private readonly sender: BoardCommandSender) {}

  updateMemberCard(
    scope: BoardScope,
    memberId: string,
    changes: MemberCardChangesInput,
  ): Promise<BoardCommandResult> {
    return this.sender.send(BOARD_EVENTS.updateMemberCard, scope, { memberId, changes });
  }
}
