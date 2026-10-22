import { WallsDaoFake } from './walls-fakes';
import type { BarValuesPo, TokenLayerPo, TokenStylePo } from '../../src/modules/tokens/tokens.po';
import type {
  NewTokenRow,
  TokenBoxPo,
  TokenFacingPo,
  TokenMovePo,
  TokenRow,
  TokenUpdatePo,
  TokensDao,
} from '../../src/modules/tokens/tokens.dao';
import type { TokenTransactionRunner } from '../../src/modules/tokens/token-transaction';
import type { MainTokenChoicePo, MainTokensDao } from '../../src/modules/tokens/main-tokens.dao';
import { AssetsDaoFake } from './assets-fakes';
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
  | 'insert'
  | 'insertMany'
  | 'findInScene'
  | 'findManyInScene'
  | 'listOfScene'
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
> {
  private cascade: Pick<CombatDaoFake, 'dropToken'> | undefined;
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

  // One 'save' for the whole paste: it is one write in the transaction.
  async insertMany(rows: readonly NewTokenRow[]): Promise<TokenRow[]> {
    const saved: TokenRow[] = [];
    for (const row of rows) saved.push(await this.insert(row));
    this.journal.splice(this.journal.length - rows.length, rows.length, 'save');
    return saved;
  }

  async findInScene(sceneId: string, tokenId: string): Promise<TokenRow | undefined> {
    return this.rows.find(({ token }) => token.id === tokenId && token.sceneId === sceneId);
  }

  async findManyInScene(sceneId: string, tokenIds: readonly string[]): Promise<TokenRow[]> {
    return this.rows.filter(
      ({ token }) => token.sceneId === sceneId && tokenIds.includes(token.id),
    );
  }

  // One write for the whole group, as the real DAO does it in one UPDATE.
  async faceMany(faces: readonly TokenFacingPo[]): Promise<void> {
    this.journal.push('save');
    for (const { tokenId, facing } of faces) this.changeToken(tokenId, { facing });
  }

  async resizeMany(boxes: readonly TokenBoxPo[]): Promise<void> {
    this.journal.push('save');
    for (const { tokenId, ...box } of boxes) this.changeToken(tokenId, box);
  }

  async restyle(tokenIds: readonly string[], style: Partial<TokenStylePo>): Promise<void> {
    this.journal.push('save');
    for (const tokenId of tokenIds) this.changeToken(tokenId, style);
  }

  async setLayer(tokenIds: readonly string[], layer: TokenLayerPo): Promise<void> {
    this.journal.push('save');
    for (const [index, found] of this.rows.entries()) {
      if (!tokenIds.includes(found.token.id)) continue;
      this.rows[index] = { ...found, token: { ...found.token, layer } };
    }
  }

  async listOfScene(sceneId: string): Promise<TokenRow[]> {
    return this.rows.filter(({ token }) => token.sceneId === sceneId);
  }

  async move(tokenId: string, col: number, row: number): Promise<void> {
    this.replace(tokenId, (found) => ({ ...found, token: { ...found.token, col, row } }));
  }

  // One 'save' for the whole group: it is one write in the transaction.
  async moveMany(moves: readonly TokenMovePo[]): Promise<void> {
    this.journal.push('save');
    for (const { tokenId, col, row } of moves) {
      const index = this.rows.findIndex(({ token }) => token.id === tokenId);
      const found = this.rows[index];
      if (found) this.rows[index] = { ...found, token: { ...found.token, col, row } };
    }
  }

  async setBarValues(barId: string, { current, max }: BarValuesPo): Promise<void> {
    const owner = this.rows.find(({ bars }) => bars.some((bar) => bar.id === barId));
    if (!owner) throw new Error(`TokensDaoFake has no bar ${barId}`);
    this.replace(owner.token.id, (found) => ({
      ...found,
      bars: found.bars.map((bar) => (bar.id === barId ? { ...bar, current, max } : bar)),
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
    this.cascade?.dropToken(tokenId);
  }

  async deleteMany(sceneId: string, tokenIds: readonly string[]): Promise<void> {
    this.journal.push('save');
    const kept = this.rows.filter(
      ({ token }) => token.sceneId !== sceneId || !tokenIds.includes(token.id),
    );
    this.rows.splice(0, this.rows.length, ...kept);
    for (const tokenId of tokenIds) this.cascade?.dropToken(tokenId);
  }

  /** Deleting a token from now on also drops its combat link, as the table's cascade does. */
  cascadeDeletesTo(combat: Pick<CombatDaoFake, 'dropToken'>): void {
    this.cascade = combat;
  }

  private changeToken(tokenId: string, fields: Partial<TokenRow['token']>): void {
    const index = this.rows.findIndex(({ token }) => token.id === tokenId);
    const found = this.rows[index];
    if (!found) throw new Error(`TokensDaoFake has no token ${tokenId}`);
    this.rows[index] = { ...found, token: { ...found.token, ...fields } };
  }

  private replace(tokenId: string, change: (found: TokenRow) => TokenRow): void {
    this.journal.push('save');
    const index = this.rows.findIndex(({ token }) => token.id === tokenId);
    const found = this.rows[index];
    if (!found) throw new Error(`TokensDaoFake has no token ${tokenId}`);
    this.rows[index] = change(found);
  }
}

type SceneChoicePo = MainTokenChoicePo & Readonly<{ sceneId: string }>;

/** In-memory main tokens, one per person per scene. Writes go to `journal` ('choose',
 *  'dropLostControl'), shared with the scenes fake, so a spec reads the whole order of a command.
 *
 *  Example: `const mainTokens = new MainTokensDaoFake(scenes.journal)` */
export class MainTokensDaoFake implements Pick<
  MainTokensDao,
  'listOfScene' | 'choose' | 'dropLostControl'
> {
  readonly drops: Array<Readonly<{ tokenId: string; keptUserIds: readonly string[] }>> = [];

  constructor(
    private readonly journal: string[] = [],
    readonly choices: SceneChoicePo[] = [],
  ) {}

  async listOfScene(sceneId: string): Promise<MainTokenChoicePo[]> {
    return this.choices
      .filter((choice) => choice.sceneId === sceneId)
      .map(({ userId, tokenId }) => ({ userId, tokenId }));
  }

  async choose(sceneId: string, userId: string, tokenId: string): Promise<void> {
    this.journal.push('choose');
    const kept = this.choices.filter((c) => c.sceneId !== sceneId || c.userId !== userId);
    this.choices.splice(0, this.choices.length, ...kept, { sceneId, userId, tokenId });
  }

  async dropLostControl(tokenId: string, keptUserIds: readonly string[]): Promise<void> {
    this.journal.push('dropLostControl');
    this.drops.push({ tokenId, keptUserIds: [...keptUserIds] });
    const kept = this.choices.filter(
      (c) => c.tokenId !== tokenId || keptUserIds.includes(c.userId),
    );
    this.choices.splice(0, this.choices.length, ...kept);
  }
}

/** Runs the work on the fakes and writes 'commit' to the shared journal once it resolves. */
export class TokenTransactionRunnerFake {
  constructor(
    private readonly scenes: ScenesDaoFake,
    private readonly tokens: TokensDaoFake,
    private readonly conditions: Pick<ConditionsDaoFake, 'listOfTokens'> = new ConditionsDaoFake(),
    private readonly combat: CombatDaoFake = new CombatDaoFake(),
    private readonly assets: AssetsDaoFake = new AssetsDaoFake(),
    private readonly walls: Pick<WallsDaoFake, 'listOfScene'> = new WallsDaoFake([]),
    private readonly mainTokens: MainTokensDaoFake = new MainTokensDaoFake(),
  ) {}

  readonly run: TokenTransactionRunner = async (work) => {
    this.tokens.cascadeDeletesTo(this.combat);
    const result = await work({
      scenes: this.scenes,
      tokens: this.tokens,
      conditions: this.conditions,
      combat: this.combat,
      assets: this.assets,
      walls: this.walls,
      mainTokens: this.mainTokens,
    });
    this.scenes.journal.push('commit');
    return result;
  };
}
