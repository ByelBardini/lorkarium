import { BOARD_EVENTS, type MemberCardChangesInput } from '@lorkarium/contracts';
import type { BoardCommandResult, BoardCommandSender } from './board-command-sender';

/** The party board card command of an open table; answers with its ack, never throws.
 *
 *  Example: `await commands.updateMemberCard(campaignId, biaId, { armorClass: 15 })` */
export interface MemberCardCommands {
  /** Changes the card of `memberId`: the member and the masters may. An absent field stays,
   *  `null` (or an empty text) clears it. */
  updateMemberCard(
    campaignId: string,
    memberId: string,
    changes: MemberCardChangesInput,
  ): Promise<BoardCommandResult>;
}

/** `MemberCardCommands` over the board command sender.
 *
 *  Example: `new RealtimeMemberCardCommands(sender).updateMemberCard(campaignId, biaId, { noteOne: 'x' })` */
export class RealtimeMemberCardCommands implements MemberCardCommands {
  constructor(private readonly sender: BoardCommandSender) {}

  updateMemberCard(
    campaignId: string,
    memberId: string,
    changes: MemberCardChangesInput,
  ): Promise<BoardCommandResult> {
    return this.sender.send(BOARD_EVENTS.updateMemberCard, campaignId, { memberId, changes });
  }
}
