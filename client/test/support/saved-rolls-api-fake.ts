import type {
  CreateSavedRollRequestDto,
  SavedRollDto,
  UpdateSavedRollRequestDto,
} from '@lorkarium/contracts';
import type { SavedRollsApi, SavedRollsResult } from '@/services/saved-rolls-api';
import { ScriptedAnswers } from './scripted-answers';

/** The id the server gives the next saved roll created. */
export const CREATED_SAVED_ROLL_ID = 'c7e5a3b1-4d6f-4e8a-8b2c-3d5f7b9c1e4a';

type Answers = {
  list: SavedRollsResult<readonly SavedRollDto[]>;
  create: SavedRollsResult<SavedRollDto>;
  update: SavedRollsResult<SavedRollDto>;
  remove: SavedRollsResult<null>;
};

/** A `SavedRollsApi` that keeps the saved rolls of each table like the server would (`rolls`
 *  by campaign id): a create, update or remove changes what the next `list` answers. Any
 *  method can be scripted (`answers.answer`, `answers.hold`).
 *
 *  Example: `deps.savedRolls.rolls.set(VHARN.id, [ACERTO, BENCAO])` */
export class SavedRollsApiFake implements SavedRollsApi {
  readonly rolls = new Map<string, readonly SavedRollDto[]>();
  readonly answers = new ScriptedAnswers<Answers>();

  list(campaignId: string): Promise<Answers['list']> {
    return this.answers.reply('list', campaignId, () => ({ ok: true, value: this.of(campaignId) }));
  }

  create(campaignId: string, input: CreateSavedRollRequestDto): Promise<Answers['create']> {
    return this.answers.reply('create', input, () => {
      const created: SavedRollDto = { id: CREATED_SAVED_ROLL_ID, folderId: null, ...input };
      this.rolls.set(campaignId, [...this.of(campaignId), created]);
      return { ok: true, value: created };
    });
  }

  update(
    campaignId: string,
    savedRollId: string,
    changes: UpdateSavedRollRequestDto,
  ): Promise<Answers['update']> {
    return this.answers.reply('update', { savedRollId, changes }, () => {
      const current = this.of(campaignId).find((roll) => roll.id === savedRollId);
      if (!current) return { ok: false, failure: { kind: 'not_found' } };
      const updated: SavedRollDto = { ...current, ...changes };
      this.replace(campaignId, (roll) => (roll.id === savedRollId ? updated : roll));
      return { ok: true, value: updated };
    });
  }

  remove(campaignId: string, savedRollId: string): Promise<Answers['remove']> {
    return this.answers.reply('remove', savedRollId, () => {
      const kept = this.of(campaignId).filter((roll) => roll.id !== savedRollId);
      this.rolls.set(campaignId, kept);
      return { ok: true, value: null };
    });
  }

  private of(campaignId: string): readonly SavedRollDto[] {
    return this.rolls.get(campaignId) ?? [];
  }

  private replace(campaignId: string, swap: (roll: SavedRollDto) => SavedRollDto): void {
    this.rolls.set(campaignId, this.of(campaignId).map(swap));
  }
}
