import type { CharacterChangesInput } from '@lorkarium/contracts';
import type { BoardCommandResult, TableScope } from '@/services/board-command-sender';
import type { SheetCharacterCommands } from '@/sheet-sandbox/sheet-bridge-character';

export type SentCharacterUpdate = Readonly<{
  campaignId: string;
  characterId: string;
  changes: CharacterChangesInput;
}>;

/** The `character:update` a sheet sent: `updates` keeps each one (the table only, no grid) and
 *  every one answers `answer` (ok at version 5 by default).
 *
 *  Example: `characters.answer = { ok: false, failure: 'forbidden' }` */
export class CharacterCommandsFake implements SheetCharacterCommands {
  readonly updates: SentCharacterUpdate[] = [];
  answer: BoardCommandResult = { ok: true, version: 5 };

  async updateCharacter(
    scope: TableScope,
    characterId: string,
    changes: CharacterChangesInput,
  ): Promise<BoardCommandResult> {
    this.updates.push({ campaignId: scope.campaignId, characterId, changes });
    return this.answer;
  }
}
