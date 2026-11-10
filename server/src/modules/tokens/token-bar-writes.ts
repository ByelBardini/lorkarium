import type { AdjustBarCommandDto } from '@lorkarium/contracts';
import type { CampaignAccessBo } from '../campaigns/campaign-access.bo';
import type { ScenePo } from '../scenes/scenes.po';
import { tokenRulesOf, type TokenLimits } from './token-group-moves';
import { tokenAccessOf } from './token-transaction';
import type { TokenRow } from './tokens.dao';
import { BarNotFoundError } from './tokens.error';
import type { BarValuesPo } from './tokens.po';

/** The token whose bars change, on its grid (absent = the group grid). */
export type TokenBarsAddress = Pick<AdjustBarCommandDto, 'tokenId' | 'sceneId'>;
export type TokenBarWrite = Readonly<{ barId: string; values: BarValuesPo }>;
/** The writes a bar rule answers for a token's bars (a linked one's are its character's). */
export type TokenBarsRewrite = (bars: TokenRow['bars']) => readonly TokenBarWrite[];
/** The writes of one bar command, decided under the grid lock. */
export type TokenBarWritesOf = (
  access: CampaignAccessBo,
  found: TokenRow,
  scene: ScenePo,
) => readonly TokenBarWrite[];

// Control first, then the bar of the token and the rule of the game-core (`set` over the max
// is cut there).
/** The values of one bar after `token:adjustBar`, or FORBIDDEN / BAR_NOT_FOUND.
 *
 *  Example: `adjustedBarOf(access, found, scene, deps, command)` */
export function adjustedBarOf(
  access: CampaignAccessBo,
  found: TokenRow,
  scene: Pick<ScenePo, 'widthCells' | 'heightCells'>,
  limits: TokenLimits,
  { tokenId, barId, change }: Pick<AdjustBarCommandDto, 'tokenId' | 'barId' | 'change'>,
): BarValuesPo {
  tokenAccessOf(access, found).requireControl('adjust a bar of');
  const bar = found.bars.find(({ id }) => id === barId);
  if (!bar) throw new BarNotFoundError(tokenId, barId);
  return tokenRulesOf(scene, [], limits).adjustBar(bar, change);
}

/** The writes a caller's rule answers for a token's bars, once the member controls it.
 *
 *  Example: `ruledBarWritesOf(access, found, (bars) => spentBarWritesOf(holder, bars, costs))` */
export function ruledBarWritesOf(
  access: CampaignAccessBo,
  found: TokenRow,
  rule: TokenBarsRewrite,
): readonly TokenBarWrite[] {
  tokenAccessOf(access, found).requireControl('change the bars of');
  return rule(found.bars);
}
