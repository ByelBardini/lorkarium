import type { SetTokensHiddenCommandDto } from '@lorkarium/contracts';
import type { ClockPort } from '../auth/clock.port';
import type { CampaignMembersDao } from '../campaigns/campaign-members.dao';
import { memberAccessOf } from '../campaigns/member-access';
import type { BoardPublisherPort, VeiledLightsChange } from '../scenes/board-publisher.port';
import {
  inLockedGridWithCast,
  type CastAndGridChange,
  type LockedGridMaybeCast,
  type SavedVersion,
} from '../scenes/locked-cast';
import { hiddenCutsOf, veiledLightsCutsOf, type VeilChange } from './token-hidden.mapper';
import { changedVisibility } from './token-rules.bo';
import {
  audiencesOf,
  combatOf,
  tokenConditionsOf,
  tokensIn,
  type TokenAudiences,
  type TokenTransactionRunner,
  type TokenWriteDaos,
} from './token-transaction';
import { publishVeiledLights } from './token-veil';
import { joinedVeil, sceneVeilOf, veilOf } from './token-veil.mapper';
import type { TokenRow } from './tokens.dao';

export type SetTokensHidden = Omit<SetTokensHiddenCommandDto, 'actionId' | 'campaignId'>;

export type TokenVisibilityServiceDeps = Readonly<{
  members: Pick<CampaignMembersDao, 'findMembership'>;
  transaction: TokenTransactionRunner;
  publisher: BoardPublisherPort;
  clock: ClockPort;
}>;

type HiddenWrite = Readonly<{
  changed: readonly TokenAudiences[];
  scene: VeilChange;
  lights: VeiledLightsChange['cuts'];
}>;

const NOTHING_CHANGED: CastAndGridChange<HiddenWrite | null> = {
  value: null,
  grid: false,
  cast: false,
};

/** The master hides tokens from the players or shows them again, on the grid the command names.
 *  Who keeps seeing them gets the flag; who stops gets them deleted, who starts gets them created
 *  (spec §3.9: the server never sends a hidden token to who may not see it).
 *
 *  Example: `await visibility.setHiddenMany(ana.id, campaignId, { tokenIds: [wolfId], hidden: true })` */
export class TokenVisibilityService {
  constructor(private readonly deps: TokenVisibilityServiceDeps) {}

  /** All or nothing: an id that is not on the grid (another table's too) is TOKEN_NOT_FOUND and
   *  none changes. Tokens already so are not written; when none changes, the current version
   *  comes back with no bump and no event. */
  async setHiddenMany(
    userId: string,
    campaignId: string,
    command: SetTokensHidden,
  ): Promise<number> {
    const access = await memberAccessOf(this.deps.members, campaignId, userId);
    access.requireMaster('hide tokens');
    const address = { campaignId, sceneId: command.sceneId, access };
    const saved = await inLockedGridWithCast(this.deps.transaction, address, (locked) =>
      this.write(locked, command),
    );
    if (saved.grid && saved.value)
      this.publish(campaignId, saved.grid, command.hidden, saved.value);
    return saved.version;
  }

  private async write(
    { daos, scene }: LockedGridMaybeCast<TokenWriteDaos>,
    { tokenIds, hidden }: SetTokensHidden,
  ): Promise<CastAndGridChange<HiddenWrite | null>> {
    const rows = await tokensIn(daos, scene, scene.campaignId, tokenIds);
    const changedIds = new Set(
      changedVisibility(
        rows.map(({ token }) => token),
        hidden,
      ),
    );
    if (changedIds.size === 0) return NOTHING_CHANGED;
    await daos.tokens.setHidden(scene.id, [...changedIds], hidden);
    const after = sceneVeilOf(await daos.tokens.veilOfScene(scene.id));
    const changed = flaggedAll(
      rows.filter(({ token }) => changedIds.has(token.id)),
      hidden,
    );
    const touched = veilOf(flaggedAll(changed, true));
    const before = hidden ? withoutIds(after, changedIds) : joinedVeil(after, touched);
    const value = {
      changed: await audiencesWithConditions(daos, changed),
      scene: { before, after, combat: await combatOf(daos, scene) },
      lights: veiledLightsCutsOf(
        after,
        touched.tokens.filter(({ light }) => light !== null),
      ),
    };
    return { value, grid: true, cast: false };
  }

  private publish(
    campaignId: string,
    saved: SavedVersion,
    hidden: boolean,
    write: HiddenWrite,
  ): void {
    const { sceneId, version } = saved;
    const at = this.deps.clock.now().toISOString();
    const base = { campaignId, sceneId, version, at };
    const cuts = hiddenCutsOf(base, write.changed, hidden, write.scene);
    this.deps.publisher.tokensHiddenChanged({ campaignId, sceneId, cuts });
    publishVeiledLights(this.deps.publisher, { campaignId, sceneId, at }, write.lights);
  }
}

function flagged(row: TokenRow, hidden: boolean): TokenRow {
  return { ...row, token: { ...row.token, hidden } };
}

function flaggedAll(rows: readonly TokenRow[], hidden: boolean): TokenRow[] {
  return rows.map((row) => flagged(row, hidden));
}

function withoutIds(veil: VeilChange['after'], ids: ReadonlySet<string>): VeilChange['after'] {
  return { tokens: veil.tokens.filter(({ tokenId }) => !ids.has(tokenId)) };
}

// The changed tokens as each audience sees them, with their conditions (a linked one's are its
// character's), in one read.
async function audiencesWithConditions(
  daos: TokenWriteDaos,
  rows: readonly TokenRow[],
): Promise<TokenAudiences[]> {
  const conditionsOf = await tokenConditionsOf(daos.conditions, rows);
  return rows.map((row) => audiencesOf({ row, conditions: conditionsOf(row) }));
}
