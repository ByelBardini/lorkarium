import { BOARD_EVENTS, type BarChangeDto, type CharacterChangesInput } from '@lorkarium/contracts';
import type { BoardCommandResult, BoardCommandSender, BoardScope } from './board-command-sender';

/** The commands of a table's character (its player or a master); each answers with its ack,
 *  never throws. Only the scope's table goes out: a character belongs to no grid. The change itself arrives as `character:changed`, like everyone else's.
 *
 *  Example: `await commands.updateCharacter(scope, lyraId, { armorClass: 15 })` */
export interface CharacterCommands {
  /** Changes the card fields: an absent one stays, `null` (or an empty text) clears it. */
  updateCharacter(
    scope: BoardScope,
    characterId: string,
    changes: CharacterChangesInput,
  ): Promise<BoardCommandResult>;
  /** A bar of the character itself, with no token of it in the grid. */
  adjustCharacterBar(
    scope: BoardScope,
    characterId: string,
    barId: string,
    change: BarChangeDto,
  ): Promise<BoardCommandResult>;
  /** One of its sheets becomes the one the card and the dock open. */
  setMainSheet(
    scope: BoardScope,
    characterId: string,
    sheetId: string,
  ): Promise<BoardCommandResult>;
}

/** `CharacterCommands` over the board command sender, with no grid in the payload.
 *
 *  Example: `new RealtimeCharacterCommands(sender).setMainSheet(scope, lyraId, sheetId)` */
export class RealtimeCharacterCommands implements CharacterCommands {
  constructor(private readonly sender: BoardCommandSender) {}

  updateCharacter(
    scope: BoardScope,
    characterId: string,
    changes: CharacterChangesInput,
  ): Promise<BoardCommandResult> {
    const fields = { characterId, changes };
    return this.sender.sendToTable(BOARD_EVENTS.updateCharacter, scope.campaignId, fields);
  }

  adjustCharacterBar(
    scope: BoardScope,
    characterId: string,
    barId: string,
    change: BarChangeDto,
  ): Promise<BoardCommandResult> {
    const fields = { characterId, barId, change };
    return this.sender.sendToTable(BOARD_EVENTS.adjustCharacterBar, scope.campaignId, fields);
  }

  setMainSheet(
    scope: BoardScope,
    characterId: string,
    sheetId: string,
  ): Promise<BoardCommandResult> {
    const fields = { characterId, sheetId };
    return this.sender.sendToTable(BOARD_EVENTS.setMainSheet, scope.campaignId, fields);
  }
}
