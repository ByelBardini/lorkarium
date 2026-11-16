import type { UserPo } from '../../src/modules/auth/users.po';
import type {
  BadgeCatalogRow,
  BadgeTexts,
  LockedBadgeRow,
  SwappedBadgeImage,
} from '../../src/modules/badges/badges.dao';
import type { BadgePo } from '../../src/modules/badges/badges.po';
import type {
  BadgesTransactionRunner,
  BadgesWriteDaos,
} from '../../src/modules/badges/badges.service';
import { userPo } from './auth-factories';

export const BADGE_ID = '5c1d2e3f-4a5b-4c6d-8e7f-8a9b0c1d2e3f';
export const IMAGE_ID = '9e8d7c6b-5a4f-4e3d-8c2b-1a0f9e8d7c6b';

/** "Veterano" first in the catalog, with an image. */
export function badgeRow(overrides: Partial<BadgePo> = {}): BadgePo {
  return {
    id: BADGE_ID,
    name: 'Veterano',
    description: 'Jogou 100 sessões',
    imageId: IMAGE_ID,
    position: 0,
    createdAt: new Date('2026-11-01T12:00:00Z'),
    ...overrides,
  };
}

/** The unique index on lower(name) refusing a write, as the driver raises it under Drizzle. */
class NameTakenViolation extends Error {
  override readonly cause = { code: '23505', constraint: 'badges_name_unique' };
}

/** The catalog and the grants in memory; writes `swap:<badge>`, `reorder`, `grant:<user>` and
 *  `delete:<badge>` to the shared journal. */
export class BadgesDaoFake {
  readonly rows: BadgePo[] = [];
  readonly grants = new Map<string, string[]>();

  constructor(private readonly journal: string[] = []) {}

  async listCatalog(): Promise<BadgeCatalogRow[]> {
    const ordered = [...this.rows].sort((a, b) => a.position - b.position);
    return ordered.map((row) => ({ ...row, holders: this.holdersOf(row.id) }));
  }

  async findById(badgeId: string): Promise<BadgeCatalogRow | undefined> {
    return (await this.listCatalog()).find((row) => row.id === badgeId);
  }

  async insert(texts: BadgeTexts): Promise<BadgePo> {
    this.refuseTakenName(texts.name, null);
    const row = badgeRow({ ...texts, id: `badge-${this.rows.length + 1}`, imageId: null });
    const placed = { ...row, position: this.rows.length };
    this.rows.push(placed);
    return placed;
  }

  async update(badgeId: string, changes: Partial<BadgeTexts>): Promise<BadgePo | undefined> {
    if (changes.name !== undefined) this.refuseTakenName(changes.name, badgeId);
    const row = this.rows.find((each) => each.id === badgeId);
    if (row) Object.assign(row, changes);
    return row;
  }

  async swapImage(badgeId: string, imageId: string): Promise<SwappedBadgeImage | undefined> {
    this.journal.push(`swap:${badgeId}`);
    const row = this.rows.find((each) => each.id === badgeId);
    if (!row) return undefined;
    const previousId = row.imageId;
    row.imageId = imageId;
    return { previousId };
  }

  async isCurrentImage(imageId: string): Promise<boolean> {
    return this.rows.some((row) => row.imageId === imageId);
  }

  async lockCatalog(): Promise<LockedBadgeRow[]> {
    return (await this.listCatalog()).map(({ id, imageId }) => ({ id, imageId }));
  }

  async reorder(badgeIds: readonly string[]): Promise<void> {
    this.journal.push('reorder');
    for (const row of this.rows) row.position = badgeIds.indexOf(row.id);
  }

  async delete(badgeId: string): Promise<Pick<BadgePo, 'imageId'> | undefined> {
    this.journal.push(`delete:${badgeId}`);
    const index = this.rows.findIndex((row) => row.id === badgeId);
    if (index < 0) return undefined;
    const [row] = this.rows.splice(index, 1);
    return row ? { imageId: row.imageId } : undefined;
  }

  async grantIdsOf(userId: string): Promise<string[]> {
    const held = new Set(this.grants.get(userId) ?? []);
    return (await this.listCatalog()).filter((row) => held.has(row.id)).map((row) => row.id);
  }

  async replaceGrants(userId: string, badgeIds: readonly string[]): Promise<void> {
    this.journal.push(`grant:${userId}`);
    this.grants.set(userId, [...badgeIds]);
  }

  async badgesOfAccount(userId: string): Promise<BadgePo[]> {
    const held = new Set(await this.grantIdsOf(userId));
    const catalog = await this.listCatalog();
    return catalog.filter((row) => held.has(row.id) && row.imageId !== null);
  }

  private holdersOf(badgeId: string): number {
    return [...this.grants.values()].filter((ids) => ids.includes(badgeId)).length;
  }

  private refuseTakenName(name: string, ownId: string | null): void {
    const taken = this.rows.some(
      (row) => row.id !== ownId && row.name.toLowerCase() === name.toLowerCase(),
    );
    if (taken) throw new NameTakenViolation(`duplicate key value violates "badges_name_unique"`);
  }
}

/** `findById` over a fixed set of account ids. */
export class BadgeAccountsFake {
  constructor(private readonly ids: readonly string[]) {}

  async findById(userId: string): Promise<UserPo | undefined> {
    return this.ids.includes(userId) ? userPo({ id: userId }) : undefined;
  }
}

/** Runs the work over the same fakes and writes `commit` to the journal when it resolves. */
export function badgesTransactionOver(
  daos: BadgesWriteDaos,
  journal: string[],
): BadgesTransactionRunner {
  return async (work) => {
    const result = await work(daos);
    journal.push('commit');
    return result;
  };
}
