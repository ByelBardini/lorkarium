import type { CharacterRow } from '../../src/modules/characters/characters.dao';
import type { TokenRow } from '../../src/modules/tokens/tokens.dao';
import { CharacterPublisherFake, CharactersDaoFake } from './characters-fakes';
import { LYRA_CHARACTER_ID, characterBarPo, characterPo } from './characters-factories';
import { ClockFake } from './auth-fakes';
import { ANA_ID } from './auth-factories';
import { CampaignMembersDaoFake, CampaignsDaoFake } from './campaigns-fakes';
import { BIA_ID, CAIO_ID, QUELM_ID, VHARN_ID, campaignMemberPo } from './campaigns-factories';
import { CombatDaoFake } from './combat-fakes';
import { ConditionsDaoFake } from './conditions-fakes';
import { torrePo } from './library-factories';
import { BoardPublisherFake, ScenesDaoFake } from './scenes-fakes';
import { VHARN_SCENE_ID, scenePo } from './scenes-factories';
import { TokenTransactionRunnerFake, TokensDaoFake } from './tokens-fakes';
import { LYRA_ID, lyraPo, lyraRow, pvBar } from './tokens-factories';
import { WallsDaoFake } from './walls-fakes';
import { TokenCharacterLinkDaoFake } from './token-character-link-fakes';

export const NOW = new Date('2026-10-23T21:00:00Z');
export const KAEL_ID = '0b1c2d3e-4f5a-4b6c-9d7e-8f9a0b1c2d3e';
export const ESTRADA_LYRA_ID = '1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f';
export const VHARN_TORRE_ID = torrePo().id;
export const QUELM_SCENE_ID = 'quelm-scene';
export const QUELM_TOKEN_ID = '8a7b6c5d-4e3f-4a2b-9c1d-0e9f8a7b6c5d';

/** Lyra, the character of Bia at Vharn: her PV (32/45, only for its controllers) and
 *  Inspiração (1/1, seen by everyone), controlled by Bia. */
export function lyraCharacterRow(): CharacterRow {
  const id = LYRA_CHARACTER_ID;
  return {
    character: characterPo(),
    bars: [
      characterBarPo({ id: `${id}-pv`, current: 32, max: 45 }),
      characterBarPo({
        ...{ id: `${id}-insp`, position: 1, label: 'Inspiração', current: 1, max: 1 },
        ...{ color: 'gold', visibility: 'everyone' },
      }),
    ],
    controllerIds: [BIA_ID],
    holderRole: 'player',
    conditions: [],
  };
}

/** Lyra on the Torre, linked to her character, at (8, 2): stored without bars nor controllers.
 *
 *  Example: `table.tokens.rows.push(linkedLyraRow())` */
export function linkedLyraRow(overrides: Partial<TokenRow['token']> = {}): TokenRow {
  const token = lyraPo({ id: ESTRADA_LYRA_ID, sceneId: VHARN_TORRE_ID, col: 8, row: 2 });
  return {
    token: { ...token, characterId: LYRA_CHARACTER_ID, ...overrides },
    bars: [],
    controllerIds: [],
    forms: [],
  };
}

/** Kael, an unlinked token of the Torre at (2, 2) with a PV of 10/10, controlled by Caio. */
export function kaelRow(): TokenRow {
  const token = lyraPo({
    id: KAEL_ID,
    sceneId: VHARN_TORRE_ID,
    name: 'Kael',
    initials: 'KA',
    col: 2,
    row: 2,
  });
  const pv = pvBar({ id: `${KAEL_ID}-pv`, tokenId: KAEL_ID, current: 10, max: 10 });
  return { token, bars: [pv], controllerIds: [CAIO_ID], forms: [] };
}

/** Vharn with Ana master, Bia and Caio players; the Salão (group grid, version 4), the public
 *  Torre (version 7) and Quelm's scene; Lyra on the Salão; Lyra the
 *  character (characters' version 5). Every fake writes to `scenes.journal`. Built fresh per spec.
 *
 *  Example: `const table = new CharacterTableFake(); table.tokens.rows.push(linkedLyraRow())` */
export class CharacterTableFake {
  readonly members = new CampaignMembersDaoFake(
    new CampaignsDaoFake(),
    { [ANA_ID]: 'Ana', [BIA_ID]: 'Bia', [CAIO_ID]: 'Caio' },
    [
      campaignMemberPo({ campaignId: VHARN_ID, userId: ANA_ID, role: 'master' }),
      campaignMemberPo({ campaignId: VHARN_ID, userId: BIA_ID, role: 'player' }),
      campaignMemberPo({ campaignId: VHARN_ID, userId: CAIO_ID, role: 'player' }),
      campaignMemberPo({ campaignId: QUELM_ID, userId: CAIO_ID, role: 'master' }),
    ],
  );
  readonly scenes = new ScenesDaoFake([
    scenePo({ version: 4, visibility: 'public' }),
    torrePo({ visibility: 'public' }),
    scenePo({ id: QUELM_SCENE_ID, campaignId: QUELM_ID }),
  ]);
  readonly journal = this.scenes.journal;
  readonly tokens = new TokensDaoFake(this.journal, [
    lyraRow(),
    lyraRow({ token: lyraPo({ id: QUELM_TOKEN_ID, sceneId: QUELM_SCENE_ID }) }),
  ]);
  readonly conditions = new ConditionsDaoFake(this.journal);
  readonly combat = new CombatDaoFake(this.journal);
  readonly publisher = new BoardPublisherFake(this.journal);
  readonly characters = new CharactersDaoFake(this.journal, [lyraCharacterRow()], {
    [VHARN_ID]: 5,
  });
  readonly characterLinks = new TokenCharacterLinkDaoFake(
    this.journal,
    this.tokens,
    this.conditions,
    this.characters,
  );
  readonly characterPublisher = new CharacterPublisherFake(this.journal);
  readonly clock = new ClockFake(NOW);
  readonly transaction = new TokenTransactionRunnerFake(
    this.scenes,
    this.tokens,
    this.conditions,
    this.combat,
    undefined,
    new WallsDaoFake([]),
    this.characters,
    this.characterLinks,
  );

  constructor() {
    this.scenes.activeOf.set(VHARN_ID, VHARN_SCENE_ID);
    this.scenes.activeOf.set(QUELM_ID, QUELM_SCENE_ID);
    this.characters.conditionsFrom(this.conditions);
  }

  /** Envenenado (2 rounds) on `tokenId`, without touching the journal. */
  poison(tokenId: string = LYRA_ID): string {
    const conditionId = this.conditions.define(VHARN_ID, 'Envenenado', 'harm');
    const active = {
      id: `${tokenId}-poison`,
      tokenId,
      characterId: null,
      conditionId,
      name: 'Envenenado',
      tone: 'harm' as const,
      icon: 'circle-dot' as const,
      look: null,
      color: null,
      description: '',
      maxStacks: null,
      imageAssetId: null,
      stacks: 1,
      remainingRounds: 2,
      appliedRound: null,
    };
    this.conditions.active.push(active);
    return active.id;
  }
}

export { VHARN_SCENE_ID };
