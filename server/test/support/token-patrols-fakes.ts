import type {
  PatrolledTokenPo,
  PatrolPausePo,
  TokenPatrolWrites,
  TokenPosePo,
} from '../../src/modules/tokens/token-patrols.dao';
import type { TokenPatrolPo } from '../../src/modules/tokens/token-patrols.po';
import type { TokenRow } from '../../src/modules/tokens/tokens.dao';

/** Where the patrols fake keeps them: on the rows of the tokens fake, as the real DAO reads them
 *  joined to the token. */
export type PatrolRowStore = Readonly<{ rows: TokenRow[] }>;

/** In-memory patrols of the tokens of every scene, written on the `TokensDaoFake` rows; every
 *  write goes to `journal` ('savePatrol', 'removePatrol', 'startPatrols', 'pausePatrols', 'place'),
 *  and only a token of the scene named is written (§2.6).
 *
 *  Example: `tokens.patrols.save(VHARN_SCENE_ID, kaelPatrolPo())` */
export class TokenPatrolsDaoFake implements TokenPatrolWrites {
  /** The scenes whose running patrols were counted. */
  readonly counted: string[] = [];
  /** Every rank asked (`runningRankOf`), with the answer. */
  readonly ranked: { sceneId: string; tokenId: string; rank: number }[] = [];

  constructor(
    private readonly journal: string[],
    private readonly store: PatrolRowStore,
  ) {}

  async save(sceneId: string, patrol: TokenPatrolPo): Promise<void> {
    this.journal.push('savePatrol');
    this.change(sceneId, [patrol.tokenId], (row) => ({ ...row, patrol }));
  }

  async remove(sceneId: string, tokenId: string): Promise<void> {
    this.journal.push('removePatrol');
    this.change(sceneId, [tokenId], (row) => ({ ...row, patrol: null }));
  }

  async start(sceneId: string, tokenIds: readonly string[], at: Date): Promise<void> {
    this.journal.push('startPatrols');
    this.change(sceneId, tokenIds, (row) => ({
      ...row,
      patrol: row.patrol && { ...row.patrol, startedAt: at },
    }));
  }

  async pause(sceneId: string, pauses: readonly PatrolPausePo[]): Promise<void> {
    this.journal.push('pausePatrols');
    for (const { tokenId, col, row: tokenRow, facing, step } of pauses) {
      this.change(sceneId, [tokenId], (row) => ({
        ...row,
        token: { ...row.token, col, row: tokenRow, facing },
        patrol: row.patrol && { ...row.patrol, step, startedAt: null },
      }));
    }
  }

  async place(sceneId: string, poses: readonly TokenPosePo[]): Promise<void> {
    this.journal.push('place');
    for (const { tokenId, col, row: tokenRow, facing } of poses) {
      this.change(sceneId, [tokenId], (row) => ({
        ...row,
        token: { ...row.token, col, row: tokenRow, facing },
      }));
    }
  }

  async countRunningOfScene(sceneId: string): Promise<number> {
    this.counted.push(sceneId);
    return this.running(sceneId).length;
  }

  /** Running patrols of the scene on older tokens, by `(createdAt, id)` as the real DAO. */
  async runningRankOf(sceneId: string, tokenId: string): Promise<number> {
    const self = this.store.rows.find(({ token }) => token.id === tokenId)?.token;
    if (!self) throw new Error(`token ${tokenId} is not in the fake`);
    const rank = this.running(sceneId).filter(({ token }) => olderThan(token, self)).length;
    this.ranked.push({ sceneId, tokenId, rank });
    return rank;
  }

  async runningOf(sceneId: string, tokenIds: readonly string[]): Promise<PatrolledTokenPo[]> {
    return this.running(sceneId).filter(({ token }) => tokenIds.includes(token.id));
  }

  private running(sceneId: string): TokenRow[] {
    return this.store.rows.filter(
      ({ token, patrol }) => token.sceneId === sceneId && patrol?.startedAt,
    );
  }

  private change(
    sceneId: string,
    tokenIds: readonly string[],
    update: (row: TokenRow) => TokenRow,
  ): void {
    this.store.rows.forEach((row, index) => {
      if (row.token.sceneId !== sceneId || !tokenIds.includes(row.token.id)) return;
      this.store.rows[index] = update(row);
    });
  }
}

type Aged = Readonly<{ id: string; createdAt: Date }>;

function olderThan(token: Aged, self: Aged): boolean {
  const byTime = token.createdAt.getTime() - self.createdAt.getTime();
  return byTime < 0 || (byTime === 0 && token.id < self.id);
}
