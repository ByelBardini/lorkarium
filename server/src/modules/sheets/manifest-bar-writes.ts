import {
  MAX_BARS_PER_TOKEN,
  type PlanLimits,
  type SheetManifestBarDto,
} from '@lorkarium/contracts';
import { missingManifestBars } from '@lorkarium/game-core';
import type { CampaignAccessBo } from '../campaigns/campaign-access.bo';
import type { CharactersDao } from '../characters/characters.dao';
import { lockCharacters, savedVersionOf } from '../characters/locked-characters';
import type { ConditionsDao } from '../conditions/conditions.dao';
import { effectiveLimitsOf } from '../plans/plan-limits.bo';
import { reachedGridOf } from '../scenes/locked-scene';
import type { ScenesDao } from '../scenes/scenes.dao';
import type { TokenHangingDao } from '../tokens/token-hanging.dao';
import { withConditions, type TokenWithConditions } from '../tokens/token-transaction';
import type { ChangeScene } from '../tokens/token-veil';
import type { TokenRow, TokensDao } from '../tokens/tokens.dao';
import type { SavedMainSheets } from './main-sheet-writes';
import { toManifestBarInputsPo } from './sheet-manifest-bars.mapper';
import { toSheetTemplateManifestDto } from './sheet-templates.mapper';
import type { SheetTemplatePo } from './sheet-templates.po';
import type { CharacterPlacePo, SheetHolderPlacePo, TokenPlacePo } from './sheets.dao';

/** What adding the manifest bars reads and writes, on the sheet's transaction. */
export type ManifestBarDaos = Readonly<{
  characters: Pick<
    CharactersDao,
    'lockVersion' | 'bumpVersion' | 'findManyInCampaign' | 'replaceBars'
  >;
  scenes: Pick<ScenesDao, 'lockInCampaign' | 'bumpVersion'>;
  tokens: Pick<TokensDao, 'findInScene'>;
  tokenBars: Pick<TokenHangingDao, 'replaceBarsAndControllers'>;
  conditions: Pick<ConditionsDao, 'listOfHolders'>;
}>;

/** A loose token whose bars changed: its grid at the new version and how to publish it. */
export type SavedTokenBars = Readonly<{
  sceneId: string;
  version: number;
  token: TokenWithConditions;
  veiled: ChangeScene;
}>;

/** What giving the sheet did to its holder's bars: the labels past the cap, the characters to
 *  tell (with the main sheets already changed) and the token to tell. */
export type GivenManifestBars = Readonly<{
  skippedBars: readonly string[];
  characters: SavedMainSheets | null;
  token: SavedTokenBars | null;
}>;

/** The master who gives the sheet, its new holder, its template and the main sheets the same
 *  transaction already changed. `limits` are the table's (its owner's, read under the table
 *  lock): a character's bars stop at its plan's cap; without them, at the technical one. A loose
 *  token's stop at the plan read with its grid's lock either way. */
export type ManifestBarsGift = Readonly<{
  access: CampaignAccessBo;
  place: SheetHolderPlacePo | null;
  template: Pick<SheetTemplatePo, 'manifest'>;
  mainSheets: SavedMainSheets | null;
  limits?: PlanLimits | undefined;
}>;

/** Adds the template's bars the holder lacks (by label, `missingManifestBars`), up to the bar
 *  cap of the table's plan, inside the sheet's transaction: a character's in the characters' version (one bump with
 *  the main sheets), a loose token's in its grid's. Existing bars keep their values; nobody, an
 *  empty manifest or nothing missing writes nothing.
 *
 *  Example: `const given = await giveManifestBars(daos, { access, place, bars, mainSheets })` */
export async function giveManifestBars(
  daos: ManifestBarDaos,
  gift: ManifestBarsGift,
): Promise<GivenManifestBars> {
  const { bars } = toSheetTemplateManifestDto(gift.template.manifest);
  const nothing = { skippedBars: [], characters: gift.mainSheets, token: null };
  if (!gift.place || bars.length === 0) return nothing;
  if ('character' in gift.place) return giveToCharacter(daos, gift, bars, gift.place.character);
  return giveToToken(daos, gift, bars, gift.place.token);
}

async function giveToCharacter(
  daos: ManifestBarDaos,
  gift: ManifestBarsGift,
  bars: readonly SheetManifestBarDto[],
  place: CharacterPlacePo,
): Promise<GivenManifestBars> {
  const campaignId = gift.access.campaignIdOf();
  const locked = await lockCharacters(daos, campaignId);
  const [row] = await daos.characters.findManyInCampaign(campaignId, [place.characterId]);
  if (!row) throw new Error(`character ${place.characterId} vanished under the lock`);
  const cap = gift.limits?.maxBarsPerToken ?? MAX_BARS_PER_TOKEN;
  const plan = missingManifestBars(row.bars, bars, cap);
  const unchanged = { skippedBars: plan.skipped, characters: gift.mainSheets, token: null };
  if (plan.added.length === 0) return unchanged;
  await daos.characters.replaceBars(place.characterId, toManifestBarInputsPo(row.bars, plan.added));
  // The main sheets may have bumped the characters already: one version for both changes.
  const version = gift.mainSheets?.version ?? (await savedVersionOf(locked, true));
  const ids = [...new Set([...idsOf(gift.mainSheets), place.characterId])];
  const rows = await daos.characters.findManyInCampaign(campaignId, ids);
  return { skippedBars: plan.skipped, characters: { version, rows }, token: null };
}

async function giveToToken(
  daos: ManifestBarDaos,
  gift: ManifestBarsGift,
  manifestBars: readonly SheetManifestBarDto[],
  place: TokenPlacePo,
): Promise<GivenManifestBars> {
  const campaignId = gift.access.campaignIdOf();
  const address = { campaignId, sceneId: place.sceneId, access: gift.access };
  const scene = reachedGridOf(address, await daos.scenes.lockInCampaign(campaignId, place.sceneId));
  const found = await tokenOf(daos, scene.id, place.tokenId);
  const cap = effectiveLimitsOf(scene.owner).maxBarsPerToken;
  const plan = missingManifestBars(found.bars, manifestBars, cap);
  const unchanged = { skippedBars: plan.skipped, characters: gift.mainSheets, token: null };
  if (plan.added.length === 0) return unchanged;
  const bars = toManifestBarInputsPo(found.bars, plan.added);
  await daos.tokenBars.replaceBarsAndControllers(found.token.id, bars, found.controllerIds);
  const version = await daos.scenes.bumpVersion(scene.id);
  const token = await withConditions(daos, await tokenOf(daos, scene.id, found.token.id));
  const veiled = barsOnlyChange(found);
  return { ...unchanged, token: { sceneId: scene.id, version, token, veiled } };
}

// The sheet's place found the token under the table's lock: missing now is a broken read.
async function tokenOf(daos: ManifestBarDaos, sceneId: string, tokenId: string): Promise<TokenRow> {
  const found = await daos.tokens.findInScene(sceneId, tokenId);
  if (!found) throw new Error(`token ${tokenId} vanished from scene ${sceneId} under the lock`);
  return found;
}

// New bars touch neither the token's lights nor who controls it: only whether it is hidden.
function barsOnlyChange(found: TokenRow): ChangeScene {
  const { hidden } = found.token;
  return {
    hidden,
    formerControllerIds: found.controllerIds,
    veil: { tokens: [] },
    combat: null,
    lights: null,
  };
}

function idsOf(saved: SavedMainSheets | null): string[] {
  return saved?.rows.map(({ character }) => character.id) ?? [];
}
