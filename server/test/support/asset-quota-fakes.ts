import type { AssetRemovalLog } from '../../src/modules/assets/asset-object-removal';
import type {
  AssetReferencesDao,
  LooseAssetRow,
} from '../../src/modules/assets/asset-references.dao';
import type { AssetStoragePort } from '../../src/modules/assets/asset-storage.port';
import type { AssetSweepDao } from '../../src/modules/assets/asset-sweep.service';
import type {
  AssetKeepScope,
  AssetKeepTransactionRunner,
} from '../../src/modules/assets/assets.service';
import type { CampaignsDao } from '../../src/modules/campaigns/campaigns.dao';
import type { AssetsDaoFake } from './assets-fakes';
import { ClockFake } from './auth-fakes';
import { CampaignsDaoFake } from './campaigns-fakes';
import { CAIO_ID, QUELM_ID, campaignPo } from './campaigns-factories';
import { PlanAccountsFake, TableOwnerPlansFake } from './plan-account-fakes';

export const QUOTA_NOW = new Date('2026-11-11T12:00:00Z');

/** The bytes each owner keeps; an owner not set keeps 0. `asked` keeps each read, with its cutoff.
 *
 *  Example: `new StorageUsageFake().set(BIA_ID, 99 * MIB)` */
export class StorageUsageFake implements Pick<AssetReferencesDao, 'usageOfOwner'> {
  readonly asked: Readonly<{ ownerId: string; cutoff: Date }>[] = [];
  private readonly bytes = new Map<string, number>();

  set(ownerId: string, bytes: number): this {
    this.bytes.set(ownerId, bytes);
    return this;
  }

  async usageOfOwner(ownerId: string, cutoff: Date): Promise<number> {
    this.asked.push({ ownerId, cutoff });
    return this.bytes.get(ownerId) ?? 0;
  }
}

/** Runs the keeping work on the given DAOs, writing `keep:begin` and `keep:end` to the journal
 *  (a refusal inside leaves no `keep:end`). */
export class AssetKeepingFake {
  constructor(
    private readonly daos: Readonly<{
      campaigns: Pick<CampaignsDao, 'lockWithOwner'>;
      owners: PlanAccountsFake;
      references: StorageUsageFake;
      assets: AssetsDaoFake;
    }>,
    private readonly journal: string[],
  ) {}

  readonly run: AssetKeepTransactionRunner = async (work) => {
    this.journal.push('keep:begin');
    const scope: AssetKeepScope = this.daos;
    const result = await work(scope);
    this.journal.push('keep:end');
    return result;
  };
}

/** Loose rows in memory for the sweep: `claimSweep` answers `claimable`; `deleteUnreferenced`
 *  deletes the asked ids that are not in `referencedMeanwhile`. `calls` keeps every call in order. */
export class AssetSweepDaoFake implements AssetSweepDao {
  claimable = true;
  readonly referencedMeanwhile = new Set<string>();
  readonly calls: string[] = [];

  constructor(readonly loose: LooseAssetRow[] = []) {}

  async claimSweep(): Promise<boolean> {
    this.calls.push('claimSweep');
    return this.claimable;
  }

  async unreferencedOlderThan(cutoff: Date, limit: number): Promise<LooseAssetRow[]> {
    this.calls.push(`unreferencedOlderThan:${cutoff.toISOString()}:${limit}`);
    return this.loose.slice(0, limit);
  }

  async deleteUnreferenced(assetIds: readonly string[], cutoff: Date): Promise<string[]> {
    this.calls.push(`deleteUnreferenced:${assetIds.length}:${cutoff.toISOString()}`);
    const gone = this.loose.filter(
      (row) => assetIds.includes(row.id) && !this.referencedMeanwhile.has(row.id),
    );
    for (const row of gone) this.loose.splice(this.loose.indexOf(row), 1);
    return gone.map((row) => row.storageKey);
  }
}

/** A bucket whose `remove` fails for the keys in `failing`; `removed` keeps the ones that went. */
export class FlakyRemovalStorageFake implements Pick<AssetStoragePort, 'remove'> {
  readonly removed: string[] = [];

  constructor(private readonly failing: ReadonlySet<string> = new Set()) {}

  async remove(key: string): Promise<void> {
    if (this.failing.has(key)) throw new Error(`S3 DeleteObject of ${key} answered 503`);
    this.removed.push(key);
  }
}

/** Keeps every warning written, with its fields. */
export class RemovalLogFake implements AssetRemovalLog {
  readonly warnings: Readonly<{ fields: Readonly<Record<string, unknown>>; message: string }>[] =
    [];

  warn(fields: Readonly<Record<string, unknown>>, message: string): void {
    this.warnings.push({ fields, message });
  }
}

export type AssetQuotaHarness = Readonly<{
  deps: Readonly<{
    tableOwners: TableOwnerPlansFake;
    keeping: AssetKeepTransactionRunner;
    clock: ClockFake;
  }>;
  campaigns: CampaignsDaoFake;
  owners: PlanAccountsFake;
  usage: StorageUsageFake;
  tableOwners: TableOwnerPlansFake;
  keepJournal: string[];
}>;

/** The quota side of an `AssetsService` over `assets`: Vharn (Ana's) and Quelm (Caio's), every
 *  owner on `amigo_do_dono` until a spec sets a plan, nothing stored, the clock at `QUOTA_NOW`.
 *  The keeping transaction writes to `keepJournal` (a spec's shared journal, or its own).
 *
 *  Example: `new AssetsService({ ...quota.deps, members, assets, … })` */
export function assetQuotaOver(
  assets: AssetsDaoFake,
  keepJournal: string[] = [],
): AssetQuotaHarness {
  const campaigns = new CampaignsDaoFake([
    campaignPo(),
    campaignPo({ id: QUELM_ID, ownerId: CAIO_ID, joinCode: 'QLMR2345' }),
  ]);
  const owners = new PlanAccountsFake();
  const usage = new StorageUsageFake();
  const tableOwners = new TableOwnerPlansFake();
  const keeping = new AssetKeepingFake(
    { campaigns, owners, references: usage, assets },
    keepJournal,
  );
  const deps = { tableOwners, keeping: keeping.run, clock: new ClockFake(QUOTA_NOW) };
  return { deps, campaigns, owners, usage, tableOwners, keepJournal };
}
