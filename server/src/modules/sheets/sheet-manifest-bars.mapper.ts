import type { SheetManifestBarDto } from '@lorkarium/contracts';
import type { CharacterBarInputPo } from '../characters/characters.po';

/** A bar as stored (a character's or a token's), apart from its id, owner and position. */
type StoredBar = Readonly<CharacterBarInputPo>;

/** The bar list a holder ends with: its own bars as they are (values kept), then each manifest
 *  bar added full, seen by everyone, as a number.
 *
 *  Example: `toManifestBarInputsPo(lyra.bars, [{ label: 'MP', color: 'arcane', max: 10 }])` */
export function toManifestBarInputsPo(
  existing: readonly StoredBar[],
  added: readonly SheetManifestBarDto[],
): CharacterBarInputPo[] {
  const kept = existing.map(({ label, current, max, temp, color, visibility, display }) => ({
    ...{ label, current, max, temp },
    ...{ color, visibility, display },
  }));
  const fresh = added.map(({ label, color, max }) => ({
    ...{ label, current: max, max, temp: 0 },
    ...{ color, visibility: 'everyone' as const, display: 'number' as const },
  }));
  return [...kept, ...fresh];
}
