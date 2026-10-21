import type { ActiveConditionDto, CombatDto, NewTokenDto, TokenDto } from '@lorkarium/contracts';
import type { AssetsDao } from '../assets/assets.dao';
import { AssetNotFoundError } from '../assets/assets.error';
import type { CampaignAccessBo } from '../campaigns/campaign-access.bo';
import { CombatRosterBo, type PastedToken } from '../combat/combat-roster.bo';
import type { CombatDao } from '../combat/combat.dao';
import { toCombatDto, toCombatState } from '../combat/combat.mapper';
import type { ConditionsDao } from '../conditions/conditions.dao';
import { toActiveConditionDto } from '../conditions/conditions.mapper';
import type { SceneTransaction } from '../scenes/locked-scene';
import type { ScenesDao } from '../scenes/scenes.dao';
import type { ScenePo } from '../scenes/scenes.po';
import { TokenAccessBo } from './token-access.bo';
import type { TokenRulesBo } from './token-rules.bo';
import type { NewTokenRow, TokenRow, TokensDao } from './tokens.dao';
import { TokenNotFoundError } from './tokens.error';
import { toBarInputsPo, toTokenDto, toTokenLightPo, toTokenSightPo } from './tokens.mapper';
import type { WallsDao } from '../walls/walls.dao';

/** The DAOs a token transaction hands out, bound to the open `tx`. */
export type TokenWriteDaos = Readonly<{
  scenes: Pick<ScenesDao, 'findActiveOf' | 'lockActiveOf' | 'bumpVersion'>;
  tokens: Pick<
    TokensDao,
    | 'insert'
    | 'insertMany'
    | 'findInScene'
    | 'findManyInScene'
    | 'move'
    | 'moveMany'
    | 'faceMany'
    | 'restyle'
    | 'resizeMany'
    | 'setLayer'
    | 'setBarValues'
    | 'update'
    | 'delete'
    | 'deleteMany'
  >;
  conditions: Pick<ConditionsDao, 'listOfTokens'>;
  combat: Pick<CombatDao, 'findOfScene' | 'setTurn' | 'removeCombatants' | 'linkTokens'>;
  assets: Pick<AssetsDao, 'findManyInCampaign'>;
  walls: Pick<WallsDao, 'listOfScene'>;
}>;

export type TokenTransactionRunner = SceneTransaction<TokenWriteDaos>;

export type TokenWithConditions = Readonly<{ row: TokenRow; conditions: ActiveConditionDto[] }>;

/** A token in its two versions: whole for the master and its controllers, redacted for the rest. */
export type TokenAudiences = Readonly<{
  controllerIds: readonly string[];
  privileged: TokenDto;
  others: TokenDto;
}>;

/** A token row with its active conditions, as every token event carries it.
 *
 *  Example: `await withConditions(daos, await daos.tokens.insert(row))` */
export async function withConditions(
  daos: TokenWriteDaos,
  row: TokenRow,
): Promise<TokenWithConditions> {
  const active = await daos.conditions.listOfTokens([row.token.id]);
  return { row, conditions: active.map(toActiveConditionDto) };
}

/** The token as each audience sees it.
 *
 *  Example: `publisher.tokensCreated({ …, tokens: saved.map(audiencesOf) })` */
export function audiencesOf({ row, conditions }: TokenWithConditions): TokenAudiences {
  return {
    controllerIds: row.controllerIds,
    privileged: toTokenDto(row, 'privileged', conditions),
    others: toTokenDto(row, 'others', conditions),
  };
}

/** A token as the master sent it → the row to insert, placed and with checked controllers.
 *
 *  Example: `await daos.tokens.insert(newTokenRowOf(scene.id, rules, command))` */
export function newTokenRowOf(
  sceneId: string,
  rules: TokenRulesBo,
  token: NewTokenDto,
): NewTokenRow {
  const { col, row } = rules.place(token, token);
  const { name, initials, side, width, height, layer } = token;
  const { imageAssetId, frame, flipX, flipY, facing, sightAngle } = token;
  const look = {
    imageAssetId,
    frame,
    flipX,
    flipY,
    facing,
    sightAngle,
    ...toTokenSightPo(token.sight),
    ...toTokenLightPo(token.light),
  };
  return {
    token: { sceneId, name, initials, side, width, height, col, row, layer, ...look },
    bars: toBarInputsPo(token.bars),
    controllerIds: rules.controllers(token.controllerIds),
  };
}

/** Deleted tokens leave the combat in the same transaction: the entries they empty go and the turn
 *  passes past them (`CombatRosterBo.leavingTokens`); the links go by the cascade.
 *
 *  Example: `await leaveCombat(daos, scene, access, [tokenId])` */
export async function leaveCombat(
  daos: TokenWriteDaos,
  scene: ScenePo,
  access: CampaignAccessBo,
  leavingTokenIds: readonly string[],
): Promise<void> {
  const combat = await daos.combat.findOfScene(scene.id);
  if (!combat) return;
  const change = new CombatRosterBo(
    access,
    toCombatState(combat, () => []),
  ).leavingTokens(leavingTokenIds);
  if (!change) return;
  await daos.combat.removeCombatants(combat.combat.id, change.remove);
  if (change.turn)
    await daos.combat.setTurn(combat.combat.id, change.turn.round, change.turn.currentId);
}

/** Pasted copies join the entries of their originals that are still in the combat of the scene.
 *
 *  Example: `await joinPastedToCombat(daos, scene, access, [{ tokenId, combatantId }])` */
export async function joinPastedToCombat(
  daos: TokenWriteDaos,
  scene: ScenePo,
  access: CampaignAccessBo,
  pasted: readonly PastedToken[],
): Promise<void> {
  const combat = await daos.combat.findOfScene(scene.id);
  const state = combat ? toCombatState(combat, () => []) : null;
  for (const { combatantId, tokenIds } of new CombatRosterBo(access, state).pastedLinks(pasted))
    await daos.combat.linkTokens(combatantId, tokenIds);
}

/** The combat of the scene as clients see it, or `null` with none. */
export async function combatOf(daos: TokenWriteDaos, scene: ScenePo): Promise<CombatDto | null> {
  const combat = await daos.combat.findOfScene(scene.id);
  return combat ? toCombatDto(combat) : null;
}

/** The token only if it is on the scene of the table; another table's is TOKEN_NOT_FOUND. */
export async function tokenIn(
  daos: TokenWriteDaos,
  scene: ScenePo,
  campaignId: string,
  tokenId: string,
): Promise<TokenRow> {
  const found = await daos.tokens.findInScene(scene.id, tokenId);
  if (!found) throw new TokenNotFoundError(campaignId, tokenId);
  return found;
}

/** Every id must be on the scene: the first one missing (another table's too) refuses them all.
 *  The rows come back in the order of the ids. */
export async function tokensIn(
  daos: TokenWriteDaos,
  scene: ScenePo,
  campaignId: string,
  tokenIds: readonly string[],
): Promise<TokenRow[]> {
  const found = await daos.tokens.findManyInScene(scene.id, tokenIds);
  const byId = new Map(found.map((row) => [row.token.id, row]));
  return tokenIds.map((tokenId) => {
    const row = byId.get(tokenId);
    if (!row) throw new TokenNotFoundError(campaignId, tokenId);
    return row;
  });
}

/** Every image a command puts on tokens must be an asset of the table: the first one that is not
 *  (another table's too) refuses the command with ASSET_NOT_FOUND before anything is written.
 *
 *  Example: `await requireAssetsOf(daos, campaignId, command.tokens.map((t) => t.imageAssetId))` */
export async function requireAssetsOf(
  daos: TokenWriteDaos,
  campaignId: string,
  assetIds: readonly (string | null | undefined)[],
): Promise<void> {
  const wanted = [...new Set(assetIds.filter((id): id is string => typeof id === 'string'))];
  if (wanted.length === 0) return;
  const found = new Set(
    (await daos.assets.findManyInCampaign(campaignId, wanted)).map((a) => a.id),
  );
  const missing = wanted.find((assetId) => !found.has(assetId));
  if (missing !== undefined) throw new AssetNotFoundError(missing);
}

export function tokenAccessOf(access: CampaignAccessBo, row: TokenRow): TokenAccessBo {
  return new TokenAccessBo(access, { tokenId: row.token.id, controllerIds: row.controllerIds });
}
