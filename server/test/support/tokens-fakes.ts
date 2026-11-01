import { WallsDaoFake } from './walls-fakes';
import type { BarValuesPo, TokenLayerPo, TokenStylePo } from '../../src/modules/tokens/tokens.po';
import type {
  DragGroupPo,
  HiddenTokenPo,
  NewTokenRow,
  TokenBoxPo,
  TokenControlPo,
  TokenFacingPo,
  TokenMovePo,
  TokenRow,
  TokenUpdatePo,
  TokensDao,
} from '../../src/modules/tokens/tokens.dao';
import type { TokenTransactionRunner } from '../../src/modules/tokens/token-transaction';
import type {
  CampaignsDao,
  CampaignTokenRightsPo,
} from '../../src/modules/campaigns/campaigns.dao';
import { composedTokenRow, type TokenIdentityPo } from '../../src/modules/tokens/linked-token';
import { savedFormsOf } from '../../src/modules/tokens/token-forms.dao';
import type { TokenAnchorsDao } from '../../src/modules/tokens/token-anchors.dao';
import { MemberCardsDaoFake } from './member-cards-fakes';
import { TokenCharacterLinkDaoFake } from './token-character-link-fakes';
import { CharactersDaoFake } from './characters-fakes';
import type { MainTokenChoicePo, MainTokensDao } from '../../src/modules/tokens/main-tokens.dao';
import { AssetsDaoFake } from './assets-fakes';
import { CombatDaoFake } from './combat-fakes';
import { ConditionsDaoFake } from './conditions-fakes';
import type { ScenesDaoFake } from './scenes-fakes';
import { lyraPo, pvBar } from './tokens-factories';

/** In-memory tokens of every scene. Writes go to `journal` ('save'), shared with the scenes fake,
 *  so a spec reads the whole order of a command. `rows` are as stored; the reads compose a linked
 *  token with its character (from `wearFrom`), as the real DAO does.
 *
 *  Example: `const tokens = new TokensDaoFake(scenes.journal, [lyraRow()])` */
export class TokensDaoFake implements Pick<
  TokensDao,
  | 'insert'
  | 'insertMany'
  | 'findInScene'
  | 'findManyInScene'
  | 'findLinkedInScene'
  | 'listOfScene'
  | 'controlOfScene'
  | 'countOfScene'
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
> {
  private cascade: Pick<CombatDaoFake, 'dropToken'> | undefined;
  private worn: Pick<CharactersDaoFake, 'rows'> | undefined;
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
    const forms = savedFormsOf(id, row.forms ?? []);
    const activeFormId = forms[row.activeFormIndex ?? -1]?.id ?? null;
    const saved: TokenRow = {
      token: { ...token, activeFormId },
      bars,
      controllerIds: [...row.controllerIds],
      forms,
    };
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
    const found = this.rows.find(({ token }) => token.id === tokenId && token.sceneId === sceneId);
    return found && this.composed(found);
  }

  async findManyInScene(sceneId: string, tokenIds: readonly string[]): Promise<TokenRow[]> {
    return this.rows
      .filter(({ token }) => token.sceneId === sceneId && tokenIds.includes(token.id))
      .map((row) => this.composed(row));
  }

  async findLinkedInScene(sceneId: string, anchorTokenId: string): Promise<TokenRow | undefined> {
    const found = this.rows.find(
      ({ token }) => token.sceneId === sceneId && token.anchorTokenId === anchorTokenId,
    );
    return found && this.composed(found);
  }

  /** The characters the linked tokens wear from now on (the reads compose with them). */
  wearFrom(characters: Pick<CharactersDaoFake, 'rows'>): void {
    this.worn = characters;
  }

  /** The stored row of a token (a linked one without its character's state), or a broken test. */
  rowOf(tokenId: string): TokenRow {
    const found = this.rows.find(({ token }) => token.id === tokenId);
    if (!found) throw new Error(`TokensDaoFake has no token ${tokenId}`);
    return found;
  }

  /** Writes the stored row of a token as the anchors fake changes it. */
  store(tokenId: string, change: (found: TokenRow) => TokenRow): void {
    const index = this.rows.findIndex(({ token }) => token.id === tokenId);
    this.rows[index] = change(this.rowOf(tokenId));
  }

  // One write for the whole group, as the real DAO does it in one UPDATE scoped to the scene.
  async faceMany(sceneId: string, faces: readonly TokenFacingPo[]): Promise<void> {
    this.journal.push('save');
    for (const { tokenId, facing } of this.inScene(sceneId, faces)) {
      this.changeToken(tokenId, { facing });
    }
  }

  // A new size leaves the token without its form, as the real UPDATE does.
  async resizeMany(sceneId: string, boxes: readonly TokenBoxPo[]): Promise<void> {
    this.journal.push('save');
    for (const { tokenId, ...box } of this.inScene(sceneId, boxes)) {
      const { width, height, activeFormId } = this.rowOf(tokenId).token;
      const kept = width === box.width && height === box.height ? activeFormId : null;
      this.changeToken(tokenId, { ...box, activeFormId: kept });
    }
  }

  // A new image or frame leaves the token without its form unless the style names one (a switch).
  async restyle(tokenIds: readonly string[], style: Partial<TokenStylePo>): Promise<void> {
    this.journal.push('save');
    for (const tokenId of tokenIds) {
      const { imageAssetId, frame, activeFormId } = this.rowOf(tokenId).token;
      const newImage = style.imageAssetId !== undefined && style.imageAssetId !== imageAssetId;
      const newFrame = style.frame !== undefined && style.frame !== frame;
      const kept = newImage || newFrame ? null : activeFormId;
      this.changeToken(tokenId, { activeFormId: kept, ...style });
    }
  }

  async setLayer(tokenIds: readonly string[], layer: TokenLayerPo): Promise<void> {
    this.journal.push('save');
    for (const [index, found] of this.rows.entries()) {
      if (!tokenIds.includes(found.token.id)) continue;
      this.rows[index] = { ...found, token: { ...found.token, layer } };
    }
  }

  // One write for the group, scoped to the scene like the real UPDATE; writes 'setHidden'.
  async setHidden(
    sceneId: string,
    tokenIds: readonly string[],
    hidden: boolean,
  ): Promise<string[]> {
    this.journal.push('setHidden');
    const written = this.inScene(
      sceneId,
      tokenIds.map((tokenId) => ({ tokenId })),
    );
    for (const { tokenId } of written) this.changeToken(tokenId, { hidden });
    return written.map(({ tokenId }) => tokenId);
  }

  // Writes 'veil' so a spec sees when (and whether) the extra query ran.
  async veilOfScene(sceneId: string): Promise<HiddenTokenPo[]> {
    this.journal.push('veil');
    const own = await this.listOfScene(sceneId);
    return own.filter(({ token }) => token.hidden);
  }

  async listOfScene(sceneId: string): Promise<TokenRow[]> {
    return this.rows
      .filter(({ token }) => token.sceneId === sceneId)
      .map((row) => this.composed(row));
  }

  async countOfScene(sceneId: string): Promise<number> {
    return (await this.listOfScene(sceneId)).length;
  }

  async controlOfScene(sceneId: string): Promise<TokenControlPo[]> {
    const own = await this.listOfScene(sceneId);
    return own.map(({ token, controllerIds }) => ({
      tokenId: token.id,
      controllerIds: [...controllerIds],
      characterId: token.characterId,
      hidden: token.hidden,
    }));
  }

  async move(tokenId: string, col: number, row: number): Promise<void> {
    this.replace(tokenId, (found) => ({ ...found, token: { ...found.token, col, row } }));
  }

  // One 'save' for the whole group: it is one write in the transaction.
  async moveMany(sceneId: string, moves: readonly TokenMovePo[]): Promise<void> {
    this.journal.push('save');
    for (const { tokenId, col, row } of this.inScene(sceneId, moves)) {
      const index = this.rows.findIndex(({ token }) => token.id === tokenId);
      const found = this.rows[index];
      if (found) this.rows[index] = { ...found, token: { ...found.token, col, row } };
    }
  }

  private inScene<T extends Readonly<{ tokenId: string }>>(
    sceneId: string,
    items: readonly T[],
  ): T[] {
    const ids = new Set(
      this.rows.filter(({ token }) => token.sceneId === sceneId).map(({ token }) => token.id),
    );
    return items.filter(({ tokenId }) => ids.has(tokenId));
  }

  async setBarValues(barId: string, { current, max }: BarValuesPo): Promise<void> {
    const owner = this.rows.find(({ bars }) => bars.some((bar) => bar.id === barId));
    if (!owner) throw new Error(`TokensDaoFake has no bar ${barId}`);
    this.replace(owner.token.id, (found) => ({
      ...found,
      bars: found.bars.map((bar) => (bar.id === barId ? { ...bar, current, max } : bar)),
    }));
  }

  // The forms keep the ids the token had, like the real `TokenFormsDao.replace`.
  async update(tokenId: string, update: TokenUpdatePo): Promise<void> {
    this.replace(tokenId, (found) => ({
      token: { ...found.token, ...update.fields },
      bars: update.bars.map((bar, position) =>
        pvBar({ ...bar, id: `${tokenId}-bar-${position}`, tokenId, position }),
      ),
      controllerIds: [...update.controllerIds],
      forms: update.forms
        ? savedFormsOf(tokenId, update.forms, new Set(found.forms.map(({ id }) => id)))
        : found.forms,
    }));
  }

  async updateFields(
    tokenId: string,
    fields: Partial<TokenRow['token']>,
    forms?: TokenUpdatePo['forms'],
  ): Promise<void> {
    this.replace(tokenId, (found) => ({
      ...found,
      token: { ...found.token, ...fields },
      forms: forms
        ? savedFormsOf(tokenId, forms, new Set(found.forms.map(({ id }) => id)))
        : found.forms,
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

  private composed(row: TokenRow): TokenRow {
    const characterId = row.token.characterId;
    const worn = this.worn?.rows.find(({ character }) => character.id === characterId);
    return composedTokenRow(row, characterId ? worn : undefined);
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

type AnchorWrites = Pick<
  TokenAnchorsDao,
  'linkToAnchor' | 'unlinkWith' | 'moveStateTo' | 'copyStateTo' | 'dropState'
>;

/** The link writes over the tokens and conditions fakes; each writes its name to `journal`
 *  ('link', 'unlink', 'move bars', 'move conditions', 'move controllers', 'copy state',
 *  'drop state').
 *
 *  Example: `new TokenAnchorsDaoFake(scenes.journal, tokens, conditions)` */
export class TokenAnchorsDaoFake implements AnchorWrites {
  constructor(
    private readonly journal: string[],
    private readonly tokens: TokensDaoFake,
    private readonly conditions: ConditionsDaoFake,
  ) {}

  async linkToAnchor(
    tokenId: string,
    anchorTokenId: string,
    characterId: string | null,
  ): Promise<void> {
    this.journal.push('link');
    this.tokens.store(tokenId, (row) => ({
      ...row,
      token: { ...row.token, anchorTokenId, characterId },
    }));
  }

  async unlinkWith(tokenId: string, identity: TokenIdentityPo): Promise<void> {
    this.journal.push('unlink');
    this.tokens.store(tokenId, (row) => ({
      ...row,
      token: { ...row.token, ...identity, anchorTokenId: null, characterId: null },
    }));
  }

  async moveStateTo(fromTokenId: string, toTokenId: string): Promise<void> {
    const from = this.tokens.rowOf(fromTokenId);
    this.journal.push('move bars', 'move conditions', 'move controllers');
    const bars = from.bars.map((bar) => ({ ...bar, tokenId: toTokenId }));
    this.tokens.store(toTokenId, (row) => ({ ...row, bars, controllerIds: from.controllerIds }));
    this.tokens.store(fromTokenId, (row) => ({ ...row, bars: [], controllerIds: [] }));
    this.conditions.active = this.conditions.active.map((condition) =>
      condition.tokenId === fromTokenId ? { ...condition, tokenId: toTokenId } : condition,
    );
  }

  async copyStateTo(fromTokenId: string, toTokenId: string): Promise<void> {
    const from = this.tokens.rowOf(fromTokenId);
    this.journal.push('copy state');
    const bars = from.bars.map((bar) => ({
      ...bar,
      id: `${toTokenId}-${bar.id}`,
      tokenId: toTokenId,
    }));
    this.tokens.store(toTokenId, (row) => ({ ...row, bars, controllerIds: from.controllerIds }));
    const copies = this.conditions.active
      .filter((condition) => condition.tokenId === fromTokenId)
      .map((condition) => ({
        ...condition,
        id: `${toTokenId}-${condition.id}`,
        tokenId: toTokenId,
      }));
    this.conditions.active = [...this.conditions.active, ...copies];
  }

  async dropState(tokenId: string): Promise<void> {
    this.journal.push('drop state');
    this.tokens.store(tokenId, (row) => ({ ...row, bars: [], controllerIds: [] }));
    this.conditions.active = this.conditions.active.filter((c) => c.tokenId !== tokenId);
  }
}

/** The two token settings of each table, both off until a spec turns them on; `reads` keeps
 *  each table asked, so a spec proves the master's commands never read them.
 *
 *  Example: `tokenRights.turnOn(VHARN_ID, { create: true, delete: false })` */
export class TableTokenRightsFake implements Pick<CampaignsDao, 'tokenRightsOf'> {
  readonly reads: string[] = [];
  private readonly byCampaign = new Map<string, CampaignTokenRightsPo>();

  turnOn(campaignId: string, rights: Readonly<{ create: boolean; delete: boolean }>): void {
    const columns = { playersCreateTokens: rights.create, playersDeleteTokens: rights.delete };
    this.byCampaign.set(campaignId, columns);
  }

  async tokenRightsOf(campaignId: string): Promise<CampaignTokenRightsPo | undefined> {
    this.reads.push(campaignId);
    return (
      this.byCampaign.get(campaignId) ?? { playersCreateTokens: false, playersDeleteTokens: false }
    );
  }
}

/** Runs the work on the fakes and writes 'commit' to the shared journal once it resolves. The
 *  tokens wear the characters of `characters` (none by default). */
export class TokenTransactionRunnerFake {
  constructor(
    private readonly scenes: ScenesDaoFake,
    private readonly tokens: TokensDaoFake,
    private readonly conditions: Pick<
      ConditionsDaoFake,
      'listOfTokens' | 'listOfHolders'
    > = new ConditionsDaoFake(),
    private readonly combat: CombatDaoFake = new CombatDaoFake(),
    private readonly assets: AssetsDaoFake = new AssetsDaoFake(),
    private readonly walls: Pick<WallsDaoFake, 'listOfScene'> = new WallsDaoFake([]),
    private readonly mainTokens: MainTokensDaoFake = new MainTokensDaoFake(),
    private readonly memberCards: MemberCardsDaoFake = new MemberCardsDaoFake(),
    private readonly anchors: AnchorWrites = new TokenAnchorsDaoFake(
      scenes.journal,
      tokens,
      new ConditionsDaoFake(),
    ),
    private readonly characters: CharactersDaoFake = new CharactersDaoFake(scenes.journal),
    private readonly characterLinks: TokenCharacterLinkDaoFake = new TokenCharacterLinkDaoFake(
      scenes.journal,
      tokens,
      new ConditionsDaoFake(),
      characters,
    ),
  ) {
    tokens.wearFrom(characters);
  }

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
      anchors: this.anchors,
      memberCards: this.memberCards,
      characters: this.characters,
      characterLinks: this.characterLinks,
    });
    this.scenes.journal.push('commit');
    return result;
  };
}

/** The drag query over the scenes and tokens fakes: the addressed grid of the campaign (absent =
 *  the active one) and the asked tokens on it, like `TokensDao.findDragGroup`. `asked` keeps each
 *  campaign queried, as `<campaignId>:<sceneId>` when a grid was named.
 *
 *  Example: `new DragGroupsFake(scenes, tokens)` */
export class DragGroupsFake implements Pick<TokensDao, 'findDragGroup'> {
  readonly asked: string[] = [];

  constructor(
    private readonly scenes: ScenesDaoFake,
    private readonly tokens: TokensDaoFake,
  ) {}

  async findDragGroup(
    campaignId: string,
    sceneId: string | undefined,
    tokenIds: readonly string[],
  ): Promise<DragGroupPo | undefined> {
    this.asked.push(sceneId === undefined ? campaignId : `${campaignId}:${sceneId}`);
    const scene = await this.scenes.findGridInCampaign(campaignId, sceneId);
    if (!scene) return undefined;
    const found = this.tokens.rows.filter(
      ({ token }) => token.sceneId === scene.id && tokenIds.includes(token.id),
    );
    return { scene, tokens: found.map(({ token, controllerIds }) => ({ token, controllerIds })) };
  }
}
