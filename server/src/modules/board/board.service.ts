import type {
  ActiveConditionDto,
  BoardStateDto,
  TokenDto,
  VeiledLightDto,
} from '@lorkarium/contracts';
import type { ClockPort } from '../auth/clock.port';
import type { CampaignAccessBo } from '../campaigns/campaign-access.bo';
import type { CampaignMembersDao } from '../campaigns/campaign-members.dao';
import { toCampaignAccessBo } from '../campaigns/campaigns.mapper';
import type { CombatDao } from '../combat/combat.dao';
import { toCombatDto } from '../combat/combat.mapper';
import type { ConditionsDao } from '../conditions/conditions.dao';
import { toConditionDefinitionDto } from '../conditions/conditions.mapper';
import type { DrawingsDao } from '../drawings/drawings.dao';
import { toDrawingDto } from '../drawings/drawings.mapper';
import type { EffectAreasDao } from '../effect-areas/effect-areas.dao';
import { toEffectAreaDto } from '../effect-areas/effect-areas.mapper';
import type { LightsDao } from '../lights/lights.dao';
import type { MemberCardsDao } from '../member-cards/member-cards.dao';
import { toMemberCardDto } from '../member-cards/member-cards.mapper';
import { toLightDto } from '../lights/lights.mapper';
import { seenGridOf } from '../scenes/locked-scene';
import type { ScenesDao } from '../scenes/scenes.dao';
import type { MainTokensDao } from '../tokens/main-tokens.dao';
import { tokenConditionsOf } from '../tokens/token-transaction';
import { TokenAccessBo, type TokenAudience } from '../tokens/token-access.bo';
import { veilOf, veiledLightsOf } from '../tokens/token-veil.mapper';
import { combatSeenBy } from '../combat/combat-veil.mapper';
import type { TokenRow, TokensDao } from '../tokens/tokens.dao';
import { toTokenDto } from '../tokens/tokens.mapper';
import type { WallsDao } from '../walls/walls.dao';
import { toWallDto } from '../walls/walls.mapper';
import { toBoardStateDto } from './board.mapper';

/** The DAOs the snapshot reads with, bound to its read-only transaction. */
export type BoardReadDaos = Readonly<{
  scenes: Pick<ScenesDao, 'findGridInCampaign'>;
  tokens: Pick<TokensDao, 'listOfScene'>;
  conditions: Pick<ConditionsDao, 'listDefinitions' | 'listOfHolders'>;
  combat: Pick<CombatDao, 'findOfScene'>;
  drawings: Pick<DrawingsDao, 'listOfScene'>;
  effectAreas: Pick<EffectAreasDao, 'listOfScene'>;
  walls: Pick<WallsDao, 'listOfScene'>;
  lights: Pick<LightsDao, 'listOfScene'>;
  mainTokens: Pick<MainTokensDao, 'listOfScene'>;
  memberCards: Pick<MemberCardsDao, 'listOfCampaign'>;
}>;

/** Runs the reads of one snapshot in one `repeatable read`, `read only` transaction. */
export type BoardSnapshotRunner = <T>(work: (daos: BoardReadDaos) => Promise<T>) => Promise<T>;

export type BoardServiceDeps = Readonly<{
  members: Pick<CampaignMembersDao, 'findMembership'>;
  snapshot: BoardSnapshotRunner;
  clock: ClockPort;
}>;

type SharedPieces = Pick<
  BoardStateDto,
  'drawings' | 'effectAreas' | 'walls' | 'lights' | 'mainTokens'
>;
type TablePieces = Pick<BoardStateDto, 'conditionDefinitions' | 'memberCards'>;

/** The board snapshot of one grid of a table (absent `sceneId` = the group grid), as one member
 *  may see it (spec §5.6, §3.9): each token whole
 *  for its controllers and the master, redacted for everyone else; drawings, areas of effect,
 *  walls, map lights and everyone's main token whole for everyone.
 *
 *  Example: `const state = await board.snapshotFor(user.id, campaignId)` */
export class BoardService {
  constructor(private readonly deps: BoardServiceDeps) {}

  /** Every piece is read at the same instant (one snapshot transaction), so a command committed
   *  between two reads cannot leave the board half old and half new. A grid out of the member's
   *  reach is SCENE_NOT_FOUND. */
  async snapshotFor(userId: string, campaignId: string, sceneId?: string): Promise<BoardStateDto> {
    const membership = await this.deps.members.findMembership(campaignId, userId);
    const access = toCampaignAccessBo(campaignId, userId, membership);
    // The spectator reads the board as a player does (no command of theirs is accepted).
    const role = access.requireViewer();
    const address = { campaignId, sceneId, access };
    return this.deps.snapshot(async (daos) => {
      const scene = seenGridOf(address, await daos.scenes.findGridInCampaign(campaignId, sceneId));
      const seen = await tokensFor(daos, access, scene.id);
      const combatRow = await daos.combat.findOfScene(scene.id);
      const combat = combatSeenBy(combatRow ? toCombatDto(combatRow) : null, seen.invisible);
      const shared = await sharedPiecesOf(daos, scene.id);
      const mainTokens = shared.mainTokens.filter(({ tokenId }) => !seen.invisible.has(tokenId));
      const table = await tablePiecesOf(daos, campaignId);
      const at = this.deps.clock.now();
      const { tokens, veiledLights } = seen;
      const pieces = { tokens, ...shared, mainTokens, veiledLights, combat, ...table };
      return toBoardStateDto({ campaignId, viewer: { userId, role }, scene, ...pieces, at });
    });
  }
}

/** The tokens one viewer receives, the hidden ones they do not (none for the master and none they
 *  control) and the lights of those. */
type SeenTokens = Readonly<{
  tokens: TokenDto[];
  invisible: ReadonlySet<string>;
  veiledLights: VeiledLightDto[];
}>;

// The hidden tokens come from the rows already read: no query of their own.
async function tokensFor(
  daos: BoardReadDaos,
  access: CampaignAccessBo,
  sceneId: string,
): Promise<SeenTokens> {
  const rows = await daos.tokens.listOfScene(sceneId);
  const unseen = rows.filter((row) => row.token.hidden && audienceOf(access, row) === 'others');
  const invisible = new Set(unseen.map(({ token }) => token.id));
  const seen = rows.filter(({ token }) => !invisible.has(token.id));
  // A linked token shows its character's conditions; one read for the whole grid.
  const conditionsOf = await tokenConditionsOf(daos.conditions, seen);
  const tokens = seen.map((row) => tokenFor(access, row, conditionsOf(row)));
  return { tokens, invisible, veiledLights: veiledLightsOf(veilOf(unseen), invisible) };
}

// What every viewer receives whole: nothing in it is redacted.
async function sharedPiecesOf(daos: BoardReadDaos, sceneId: string): Promise<SharedPieces> {
  return {
    drawings: (await daos.drawings.listOfScene(sceneId)).map(toDrawingDto),
    effectAreas: (await daos.effectAreas.listOfScene(sceneId)).map(toEffectAreaDto),
    walls: (await daos.walls.listOfScene(sceneId)).map(toWallDto),
    lights: (await daos.lights.listOfScene(sceneId)).map(toLightDto),
    mainTokens: await daos.mainTokens.listOfScene(sceneId),
  };
}

// Of the table, not of the scene: the same on every scene.
async function tablePiecesOf(daos: BoardReadDaos, campaignId: string): Promise<TablePieces> {
  const definitions = await daos.conditions.listDefinitions(campaignId);
  const cards = await daos.memberCards.listOfCampaign(campaignId);
  return {
    conditionDefinitions: definitions.map(toConditionDefinitionDto),
    memberCards: cards.map(toMemberCardDto),
  };
}

function tokenFor(
  access: CampaignAccessBo,
  row: TokenRow,
  conditions: readonly ActiveConditionDto[],
): TokenDto {
  return toTokenDto(row, audienceOf(access, row), conditions);
}

function audienceOf(access: CampaignAccessBo, row: TokenRow): TokenAudience {
  const control = { tokenId: row.token.id, controllerIds: row.controllerIds };
  return new TokenAccessBo(access, control).audience();
}
