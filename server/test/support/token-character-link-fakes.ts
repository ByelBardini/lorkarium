import type { TokenIdentityPo } from '../../src/modules/tokens/linked-token';
import type { TokenCharacterLinkDao } from '../../src/modules/tokens/token-character-link.dao';
import type { CharactersDaoFake } from './characters-fakes';
import type { ConditionsDaoFake } from './conditions-fakes';
import type { TokensDaoFake } from './tokens-fakes';

type CharacterLinkWrites = Pick<TokenCharacterLinkDao, 'placedOn' | 'adopt' | 'release'>;

/** The link writes by the character over the tokens, conditions and characters fakes; `adopt`
 *  and `release` write their name to `journal`.
 *
 *  Example: `new TokenCharacterLinkDaoFake(journal, tokens, conditions, characters)` */
export class TokenCharacterLinkDaoFake implements CharacterLinkWrites {
  constructor(
    private readonly journal: string[],
    private readonly tokens: TokensDaoFake,
    private readonly conditions: Pick<ConditionsDaoFake, 'active'>,
    private readonly characters: Pick<CharactersDaoFake, 'rows'>,
  ) {}

  async placedOn(sceneId: string, characterId: string): Promise<{ id: string } | undefined> {
    const placed = this.tokens.rows.find(
      ({ token }) => token.sceneId === sceneId && token.characterId === characterId,
    );
    return placed && { id: placed.token.id };
  }

  async adopt(tokenId: string, characterId: string): Promise<void> {
    this.journal.push('adopt');
    this.dropOwnState(tokenId);
    this.tokens.store(tokenId, (row) => ({
      ...row,
      token: { ...row.token, characterId },
    }));
  }

  async release(tokenId: string, characterId: string, identity: TokenIdentityPo): Promise<void> {
    this.journal.push('release');
    this.dropOwnState(tokenId);
    const worn = this.characters.rows.find(({ character }) => character.id === characterId);
    const bars = (worn?.bars ?? []).map((bar) => {
      const { position, label, current, max, color, visibility, display } = bar;
      return {
        ...{ id: `${tokenId}-${bar.id}`, tokenId, position, label, current, max },
        ...{ color, visibility, display },
      };
    });
    const controllerIds = [...(worn?.controllerIds ?? [])];
    this.tokens.store(tokenId, (row) => ({
      ...row,
      token: { ...row.token, ...identity, characterId: null },
      bars,
      controllerIds,
    }));
    const copies = this.conditions.active
      .filter((condition) => condition.characterId === characterId)
      .map((condition) => ({
        ...{ ...condition, id: `${tokenId}-${condition.id}`, tokenId, characterId: null },
      }));
    this.conditions.active = [...this.conditions.active, ...copies];
  }

  private dropOwnState(tokenId: string): void {
    this.tokens.store(tokenId, (row) => ({ ...row, bars: [], controllerIds: [] }));
    this.conditions.active = this.conditions.active.filter((c) => c.tokenId !== tokenId);
  }
}
