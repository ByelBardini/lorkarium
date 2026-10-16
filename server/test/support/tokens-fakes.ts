import type {
  NewTokenRow,
  TokenRow,
  TokenUpdatePo,
  TokensDao,
} from '../../src/modules/tokens/tokens.dao';
import type { TokenTransactionRunner } from '../../src/modules/tokens/tokens.service';
import { CombatDaoFake } from './combat-fakes';
import { ConditionsDaoFake } from './conditions-fakes';
import type { ScenesDaoFake } from './scenes-fakes';
import { lyraPo, pvBar } from './tokens-factories';

/** In-memory tokens of every scene. Writes go to `journal` ('save'), shared with the scenes fake,
 *  so a spec reads the whole order of a command.
 *
 *  Example: `const tokens = new TokensDaoFake(scenes.journal, [lyraRow()])` */
export class TokensDaoFake implements Pick<
  TokensDao,
  'insert' | 'findInScene' | 'listOfScene' | 'move' | 'setBarCurrent' | 'update' | 'delete'
> {
  constructor(
    private readonly journal: string[],
    readonly rows: TokenRow[] = [],
  ) {}

  async insert(row: NewTokenRow): Promise<TokenRow> {
    this.journal.push('save');
    const id = `token-${this.rows.length + 1}`;
    const token = lyraPo({ ...row.token, id });
    const bars = row.bars.map((bar, position) =>
      pvBar({ ...bar, id: `${id}-bar-${position}`, tokenId: id, position }),
    );
    const saved: TokenRow = { token, bars, controllerIds: [...row.controllerIds] };
    this.rows.push(saved);
    return saved;
  }

  async findInScene(sceneId: string, tokenId: string): Promise<TokenRow | undefined> {
    return this.rows.find(({ token }) => token.id === tokenId && token.sceneId === sceneId);
  }

  async listOfScene(sceneId: string): Promise<TokenRow[]> {
    return this.rows.filter(({ token }) => token.sceneId === sceneId);
  }

  async move(tokenId: string, col: number, row: number): Promise<void> {
    this.replace(tokenId, (found) => ({ ...found, token: { ...found.token, col, row } }));
  }

  async setBarCurrent(barId: string, current: number): Promise<void> {
    const owner = this.rows.find(({ bars }) => bars.some((bar) => bar.id === barId));
    if (!owner) throw new Error(`TokensDaoFake has no bar ${barId}`);
    this.replace(owner.token.id, (found) => ({
      ...found,
      bars: found.bars.map((bar) => (bar.id === barId ? { ...bar, current } : bar)),
    }));
  }

  async update(tokenId: string, update: TokenUpdatePo): Promise<void> {
    this.replace(tokenId, (found) => ({
      token: { ...found.token, ...update.fields },
      bars: update.bars.map((bar, position) =>
        pvBar({ ...bar, id: `${tokenId}-bar-${position}`, tokenId, position }),
      ),
      controllerIds: [...update.controllerIds],
    }));
  }

  async delete(tokenId: string): Promise<void> {
    this.journal.push('save');
    const index = this.rows.findIndex(({ token }) => token.id === tokenId);
    if (index !== -1) this.rows.splice(index, 1);
  }

  private replace(tokenId: string, change: (found: TokenRow) => TokenRow): void {
    this.journal.push('save');
    const index = this.rows.findIndex(({ token }) => token.id === tokenId);
    const found = this.rows[index];
    if (!found) throw new Error(`TokensDaoFake has no token ${tokenId}`);
    this.rows[index] = change(found);
  }
}

/** Runs the work on the fakes and writes 'commit' to the shared journal once it resolves. */
export class TokenTransactionRunnerFake {
  constructor(
    private readonly scenes: ScenesDaoFake,
    private readonly tokens: TokensDaoFake,
    private readonly conditions: Pick<ConditionsDaoFake, 'listOfTokens'> = new ConditionsDaoFake(),
    private readonly combat: CombatDaoFake = new CombatDaoFake(),
  ) {}

  readonly run: TokenTransactionRunner = async (work) => {
    const result = await work({
      scenes: this.scenes,
      tokens: this.tokens,
      conditions: this.conditions,
      combat: this.combat,
    });
    this.scenes.journal.push('commit');
    return result;
  };
}
