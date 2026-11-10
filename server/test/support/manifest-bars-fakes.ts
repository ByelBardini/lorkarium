import type { SheetManifestBarDto } from '@lorkarium/contracts';
import type { TokenHangingDao } from '../../src/modules/tokens/token-hanging.dao';
import type { TokenRow, TokensDao } from '../../src/modules/tokens/tokens.dao';
import type { TokenBarInputPo } from '../../src/modules/tokens/tokens.po';

/** A loose token on a grid, as the sheet's transaction reads it. */
export type PlacedTokenRow = { sceneId: string; row: TokenRow };

/** In-memory tokens of the grids for the manifest bars: reads by grid, replaces the bars (and the
 *  controllers) of one token whole, writing `token bars` to the journal. A new bar's id is
 *  `<token>-bar-<position>`.
 *
 *  Example: `new SheetTokensFake(journal, [{ sceneId: VHARN_SCENE_ID, row: bramRow() }])` */
export class SheetTokensFake
  implements Pick<TokensDao, 'findInScene'>, Pick<TokenHangingDao, 'replaceBarsAndControllers'>
{
  constructor(
    private readonly journal: string[],
    readonly placed: PlacedTokenRow[] = [],
  ) {}

  async findInScene(sceneId: string, tokenId: string): Promise<TokenRow | undefined> {
    const found = this.placed.find(
      (each) => each.sceneId === sceneId && each.row.token.id === tokenId,
    );
    return found && structuredClone(found.row);
  }

  async replaceBarsAndControllers(
    tokenId: string,
    bars: readonly TokenBarInputPo[],
    controllerIds: readonly string[],
  ): Promise<void> {
    this.journal.push('token bars');
    const placed = this.placed.find(({ row }) => row.token.id === tokenId);
    if (!placed) throw new Error(`SheetTokensFake has no token ${tokenId}`);
    const saved = bars.map((bar, position) => ({
      ...{ temp: 0, display: 'number' as const, ...bar },
      ...{ id: `${tokenId}-bar-${position}`, tokenId, position },
    }));
    placed.row = { ...placed.row, bars: saved, controllerIds: [...controllerIds] };
  }

  barsOf(tokenId: string): TokenRow['bars'] {
    return this.placed.find(({ row }) => row.token.id === tokenId)?.row.bars ?? [];
  }
}

/** A manifest bar by its label, the `max` it starts full at and an `ember` color.
 *
 *  Example: `manifestBars('PV', 'MP', 'EF', 'ES')` */
export function manifestBars(...labels: string[]): SheetManifestBarDto[] {
  return labels.map((label, index) => ({ label, color: 'ember', max: 10 + index }));
}
