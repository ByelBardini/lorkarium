import type { HexColorDto, SavedColorsResponseDto } from '@lorkarium/contracts';
import { SavedColorAdmissionBo } from './saved-colors.bo';
import type { SavedColorsDao } from './saved-colors.dao';
import { toSavedColorsResponse } from './saved-colors.mapper';

export type SavedColorWriteDao = Pick<SavedColorsDao, 'lockOwner' | 'listOf' | 'insertIfAbsent'>;

export type SavedColorsTransactionRunner = <T>(
  work: (colors: SavedColorWriteDao) => Promise<T>,
) => Promise<T>;

export type SavedColorsServiceDeps = Readonly<{
  colors: Pick<SavedColorsDao, 'listOf' | 'remove'>;
  transaction: SavedColorsTransactionRunner;
  /** `SAVED_COLORS_MAX`, passed in: the BO does not read the contract. */
  maxSaved: number;
}>;

/** The list of colors of the session's account. Every answer is the whole list, most recent first.
 *
 *  Example: `await service.save(userId, '#336699') // { colors: ['#336699'] }` */
export class SavedColorsService {
  private readonly rules: SavedColorAdmissionBo;

  constructor(private readonly deps: SavedColorsServiceDeps) {
    this.rules = new SavedColorAdmissionBo(deps.maxSaved);
  }

  /** Example: `await service.list(userId) // { colors: [] }` */
  async list(userId: string): Promise<SavedColorsResponseDto> {
    return toSavedColorsResponse(await this.deps.colors.listOf(userId));
  }

  /** Counts and inserts under the account's lock, so parallel saves never pass the limit together.
   *
   *  Example: `await service.save(userId, '#aabbcc') // the same list when already kept` */
  async save(userId: string, color: HexColorDto): Promise<SavedColorsResponseDto> {
    return this.deps.transaction(async (colors) => {
      await colors.lockOwner(userId);
      const saved = await colors.listOf(userId);
      const keptColors = saved.map((row) => row.color);
      if (!this.rules.mustInsert(keptColors, color)) return toSavedColorsResponse(saved);
      const inserted = await colors.insertIfAbsent(userId, color);
      return toSavedColorsResponse(inserted ? [inserted, ...saved] : saved);
    });
  }

  /** Example: `await service.remove(userId, '#aabbcc') // the list without it` */
  async remove(userId: string, color: HexColorDto): Promise<SavedColorsResponseDto> {
    await this.deps.colors.remove(userId, color);
    return this.list(userId);
  }
}
