import type { ActiveConditionDto, CombatDto, NewTokenDto, TokenDto } from '@lorkarium/contracts';
import type { AssetsDao } from '../assets/assets.dao';
import { AssetNotFoundError } from '../assets/assets.error';
import type { CampaignAccessBo } from '../campaigns/campaign-access.bo';
import type { CampaignsDao } from '../campaigns/campaigns.dao';
import { CombatRosterBo, type PastedToken } from '../combat/combat-roster.bo';
import type { CombatDao } from '../combat/combat.dao';
import { toCombatDto, toCombatState } from '../combat/combat.mapper';
import type { ConditionsDao } from '../conditions/conditions.dao';
import { holderIdOf } from '../conditions/conditions.po';
import { conditionsByHolder, holderOfToken } from '../conditions/conditions.mapper';
import type { SceneTransaction } from '../scenes/locked-scene';
import type { ScenesDao } from '../scenes/scenes.dao';
import type { ScenePo } from '../scenes/scenes.po';
import type { CharactersDao } from '../characters/characters.dao';
import { TokenAccessBo } from './token-access.bo';
import type { TokenRulesBo } from './token-rules.bo';
import type { TokenCharacterLinkDao } from './token-character-link.dao';
import type { NewTokenRow, TokenRow, TokensDao } from './tokens.dao';
import type { NewTokenPo } from './tokens.po';
import { TokenNotFoundError } from './tokens.error';
import { toTokenAuraPo } from './token-aura.mapper';
import { pastedFormsOf } from './token-form.mapper';
import type { TokenAuthorshipBo } from './token-authorship.bo';
import {
  toBarInputsPo,
  toTokenAuthorshipBo,
  toTokenDto,
  toTokenLightPo,
  toTokenSightPo,
} from './tokens.mapper';
import type { WallsDao } from '../walls/walls.dao';

/** The DAOs a token transaction hands out, bound to the open `tx`. */
export type TokenWriteDaos = Readonly<{
  scenes: Pick<ScenesDao, 'lockInCampaign' | 'bumpVersion'>;
  tokens: Pick<
    TokensDao,
    | 'insert'
    | 'listOfScene'
    | 'insertMany'
    | 'countOfScene'
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
    | 'updateFields'
    | 'delete'
    | 'deleteMany'
    | 'setHidden'
    | 'veilOfScene'
  >;
  conditions: Pick<ConditionsDao, 'listOfHolders'>;
  combat: Pick<CombatDao, 'findOfScene' | 'setTurn' | 'removeCombatants' | 'linkTokens'>;
  assets: Pick<AssetsDao, 'findManyInCampaign'>;
  walls: Pick<WallsDao, 'listOfScene'>;
  characterLinks: Pick<TokenCharacterLinkDao, 'placedOn' | 'adopt' | 'release'>;
  characters: Pick<
    CharactersDao,
    | 'lockVersion'
    | 'bumpVersion'
    | 'findInCampaign'
    | 'findManyInCampaign'
    | 'findOfUser'
    | 'listOfCampaign'
    | 'update'
    | 'setBarValues'
    | 'replaceBars'
    | 'replaceControllers'
  >;
}>;

/** Where a player's token commands read the table settings: on the pool, before any lock. */
export type TokenRightsReader = Pick<CampaignsDao, 'tokenRightsOf'>;

export type TokenTransactionRunner = SceneTransaction<TokenWriteDaos>;

export type TokenWithConditions = Readonly<{ row: TokenRow; conditions: ActiveConditionDto[] }>;

/** A token in its two versions: whole for the master and its controllers, redacted for the rest. */
export type TokenAudiences = Readonly<{
  controllerIds: readonly string[];
  privileged: TokenDto;
  others: TokenDto;
}>;

/** A token row with its active conditions (a linked token's are its character's), as every
 *  token event carries it.
 *
 *  Example: `await withConditions(daos, await daos.tokens.insert(row))` */
export async function withConditions(
  daos: Pick<TokenWriteDaos, 'conditions'>,
  row: TokenRow,
): Promise<TokenWithConditions> {
  const conditionsOf = await tokenConditionsOf(daos.conditions, [row]);
  return { row, conditions: conditionsOf(row) };
}

/** The conditions each listed token shows, in one read: an unlinked token's own, a linked one's
 *  from the character it wears (on every grid).
 *
 *  Example: `const conditionsOf = await tokenConditionsOf(daos.conditions, rows); conditionsOf(lyra)` */
export async function tokenConditionsOf(
  conditions: Pick<ConditionsDao, 'listOfHolders'>,
  rows: readonly Pick<TokenRow, 'token'>[],
): Promise<(row: Pick<TokenRow, 'token'>) => ActiveConditionDto[]> {
  const holders = rows.map(({ token }) => holderOfToken(token));
  const byHolder = conditionsByHolder(await conditions.listOfHolders(holders));
  return ({ token }) => byHolder.get(holderIdOf(holderOfToken(token))) ?? [];
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

type NewTokenInput = Omit<NewTokenDto, 'hidden'> & Partial<Pick<NewTokenDto, 'hidden'>>;

/** A token as sent → the row to insert, placed, with checked controllers and its author. A paste
 *  carries `hidden` and the copied forms; "New token" does not, and is born visible.
 *
 *  Example: `await daos.tokens.insert(newTokenRowOf(scene.id, rules, command, userId))` */
export function newTokenRowOf(
  sceneId: string,
  rules: TokenRulesBo,
  token: NewTokenInput,
  createdBy: string,
): NewTokenRow {
  const { col, row } = rules.place(token, token);
  const { name, initials, side, width, height, layer } = token;
  const placed = { sceneId, name, initials, side, width, height, col, row, layer, createdBy };
  return {
    token: { ...placed, ...newTokenLookOf(token) },
    bars: toBarInputsPo(token.bars),
    controllerIds: rules.controllers(token.controllerIds),
    ...pastedFormsOf(token),
  };
}

function newTokenLookOf(token: NewTokenInput): Partial<NewTokenPo> {
  const { imageAssetId, frame, flipX, flipY, facing, sightAngle } = token;
  return {
    ...{ hidden: token.hidden ?? false, imageAssetId, frame, flipX, flipY, facing, sightAngle },
    ...toTokenSightPo(token.sight),
    ...toTokenLightPo(token.light),
    ...toTokenAuraPo(token.aura),
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
  // A paste of tokens with no entry to join (the usual one) does not read the combat.
  if (!pasted.some(({ combatantId }) => combatantId)) return;
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

type TokenReads = Readonly<{ tokens: Pick<TokensDao, 'findInScene' | 'findManyInScene'> }>;

/** The token only if it is on the scene of the table; another table's is TOKEN_NOT_FOUND. */
export async function tokenIn(
  daos: Pick<TokenReads, 'tokens'>,
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
  daos: TokenReads,
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

/** Every image a command puts on tokens (or on a condition) must be an asset of the table: the
 *  first one that is not (another table's too) refuses the command with ASSET_NOT_FOUND before
 *  anything is written.
 *
 *  Example: `await requireAssetsOf(daos, campaignId, command.tokens.map((t) => t.imageAssetId))` */
export async function requireAssetsOf(
  daos: Readonly<{ assets: Pick<AssetsDao, 'findManyInCampaign'> }>,
  campaignId: string,
  assetIds: readonly (string | null | undefined)[],
): Promise<void> {
  const wanted = [...new Set(assetIds.filter((id): id is string => typeof id === 'string'))];
  if (wanted.length === 0) return;
  const found = new Set(
    (await daos.assets.findManyInCampaign(campaignId, wanted))
      .filter((asset) => asset.purpose !== 'library_image' && asset.purpose !== 'document_image')
      .map((a) => a.id),
  );
  const missing = wanted.find((assetId) => !found.has(assetId));
  if (missing !== undefined) throw new AssetNotFoundError(missing);
}

/** Who may create, edit and delete: the master without reading anything; a player by the table
 *  settings as they are now, read before the command locks the grid (a refused create locks
 *  nothing).
 *
 *  Example: `(await authorshipOf(this.deps.tokenRights, access)).requireCreate(command)` */
export async function authorshipOf(
  reader: TokenRightsReader,
  access: CampaignAccessBo,
): Promise<TokenAuthorshipBo> {
  if (access.isMaster()) return toTokenAuthorshipBo(access, undefined);
  return toTokenAuthorshipBo(access, await reader.tokenRightsOf(access.campaignIdOf()));
}

export function tokenAccessOf(access: CampaignAccessBo, row: TokenRow): TokenAccessBo {
  return new TokenAccessBo(access, { tokenId: row.token.id, controllerIds: row.controllerIds });
}
