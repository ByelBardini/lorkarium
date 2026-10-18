import type { ActiveConditionDto, BoardStateDto, TokenDto } from '@lorkarium/contracts';
import type { ClockPort } from '../auth/clock.port';
import type { CampaignAccessBo } from '../campaigns/campaign-access.bo';
import type { CampaignMembersDao } from '../campaigns/campaign-members.dao';
import { toCampaignAccessBo } from '../campaigns/campaigns.mapper';
import type { CombatDao } from '../combat/combat.dao';
import { toCombatDto } from '../combat/combat.mapper';
import type { ConditionsDao } from '../conditions/conditions.dao';
import { conditionsByToken, toConditionDefinitionDto } from '../conditions/conditions.mapper';
import type { DrawingsDao } from '../drawings/drawings.dao';
import { toDrawingDto } from '../drawings/drawings.mapper';
import type { EffectAreasDao } from '../effect-areas/effect-areas.dao';
import { toEffectAreaDto } from '../effect-areas/effect-areas.mapper';
import type { ScenesDao } from '../scenes/scenes.dao';
import { TokenAccessBo } from '../tokens/token-access.bo';
import type { TokenRow, TokensDao } from '../tokens/tokens.dao';
import { toTokenDto } from '../tokens/tokens.mapper';
import { toBoardStateDto } from './board.mapper';

export type BoardServiceDeps = Readonly<{
  members: Pick<CampaignMembersDao, 'findMembership'>;
  scenes: Pick<ScenesDao, 'findActiveOf'>;
  tokens: Pick<TokensDao, 'listOfScene'>;
  conditions: Pick<ConditionsDao, 'listDefinitions' | 'listOfTokens'>;
  combat: Pick<CombatDao, 'findOfScene'>;
  drawings: Pick<DrawingsDao, 'listOfScene'>;
  effectAreas: Pick<EffectAreasDao, 'listOfScene'>;
  clock: ClockPort;
}>;

/** The board snapshot of one table, as one member may see it (spec §5.6, §3.9): each token whole
 *  for its controllers and the master, redacted for everyone else; drawings and areas of effect whole for everyone.
 *
 *  Example: `const state = await board.snapshotFor(user.id, campaignId)` */
export class BoardService {
  constructor(private readonly deps: BoardServiceDeps) {}

  async snapshotFor(userId: string, campaignId: string): Promise<BoardStateDto> {
    const membership = await this.deps.members.findMembership(campaignId, userId);
    const access = toCampaignAccessBo(campaignId, userId, membership);
    const role = access.requireMember();
    const scene = await this.deps.scenes.findActiveOf(campaignId);
    if (!scene) {
      throw new Error(`campaign ${campaignId} has no active scene; every campaign has one`);
    }
    const rows = await this.deps.tokens.listOfScene(scene.id);
    const active = await this.deps.conditions.listOfTokens(rows.map(({ token }) => token.id));
    const byToken = conditionsByToken(active);
    const tokens = rows.map((row) => tokenFor(access, row, byToken.get(row.token.id) ?? []));
    const combatRow = await this.deps.combat.findOfScene(scene.id);
    const combat = combatRow ? toCombatDto(combatRow) : null;
    const drawings = (await this.deps.drawings.listOfScene(scene.id)).map(toDrawingDto);
    const effectAreas = (await this.deps.effectAreas.listOfScene(scene.id)).map(toEffectAreaDto);
    const definitions = await this.deps.conditions.listDefinitions(campaignId);
    const conditionDefinitions = definitions.map(toConditionDefinitionDto);
    const at = this.deps.clock.now();
    const viewer = { userId, role };
    const pieces = { tokens, drawings, effectAreas, combat, conditionDefinitions };
    return toBoardStateDto({ campaignId, viewer, scene, ...pieces, at });
  }
}

function tokenFor(
  access: CampaignAccessBo,
  row: TokenRow,
  conditions: readonly ActiveConditionDto[],
): TokenDto {
  const control = { tokenId: row.token.id, controllerIds: row.controllerIds };
  return toTokenDto(row, new TokenAccessBo(access, control).audience(), conditions);
}
