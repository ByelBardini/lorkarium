import type { TokenRow } from '../../src/modules/tokens/tokens.dao';
import { ClockFake } from './auth-fakes';
import { ANA_ID } from './auth-factories';
import { CampaignMembersDaoFake, CampaignsDaoFake } from './campaigns-fakes';
import { BIA_ID, CAIO_ID, QUELM_ID, VHARN_ID, campaignMemberPo } from './campaigns-factories';
import { CombatDaoFake } from './combat-fakes';
import { ConditionsDaoFake } from './conditions-fakes';
import { torrePo } from './library-factories';
import { MemberCardsDaoFake } from './member-cards-fakes';
import { BoardPublisherFake, ScenesDaoFake } from './scenes-fakes';
import { VHARN_CAST_ID, VHARN_SCENE_ID, castPo, scenePo } from './scenes-factories';
import {
  MainTokensDaoFake,
  TokenAnchorsDaoFake,
  TokenTransactionRunnerFake,
  TokensDaoFake,
} from './tokens-fakes';
import { LYRA_ID, inspirationBar, lyraPo, lyraRow, pvBar } from './tokens-factories';
import { WallsDaoFake } from './walls-fakes';

export const NOW = new Date('2026-10-23T21:00:00Z');
export const LYRA_ANCHOR_ID = '9f8e7d6c-5b4a-4c3d-8e2f-1a0b9c8d7e6f';
export const KAEL_ID = '0b1c2d3e-4f5a-4b6c-9d7e-8f9a0b1c2d3e';
export const ESTRADA_LYRA_ID = '1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f';
export const VHARN_TORRE_ID = torrePo().id;
export const QUELM_SCENE_ID = 'quelm-scene';
export const QUELM_TOKEN_ID = '8a7b6c5d-4e3f-4a2b-9c1d-0e9f8a7b6c5d';

/** Lyra's anchor in the cast of Vharn: her PV and Inspiração, controlled by Bia. */
export function lyraAnchorRow(): TokenRow {
  const id = LYRA_ANCHOR_ID;
  return {
    token: lyraPo({ id, sceneId: VHARN_CAST_ID, col: 0, row: 0 }),
    bars: [
      pvBar({ id: `${id}-pv`, tokenId: id }),
      inspirationBar({ id: `${id}-insp`, tokenId: id }),
    ],
    controllerIds: [BIA_ID],
  };
}

/** Lyra on the Torre, linked to her anchor, at (8, 2): stored without bars nor controllers.
 *
 *  Example: `table.tokens.rows.push(lyraAnchorRow(), linkedLyraRow())` */
export function linkedLyraRow(overrides: Partial<TokenRow['token']> = {}): TokenRow {
  const token = lyraPo({ id: ESTRADA_LYRA_ID, sceneId: VHARN_TORRE_ID, col: 8, row: 2 });
  return {
    token: { ...token, anchorTokenId: LYRA_ANCHOR_ID, ...overrides },
    bars: [],
    controllerIds: [],
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
  return { token, bars: [pv], controllerIds: [CAIO_ID] };
}

/** Vharn with Ana master, Bia and Caio players; the Salão (group grid, version 4), the public
 *  Torre (version 7), the cast (version 2) and Quelm's scene; Lyra on the Salão. Every fake
 *  writes to `scenes.journal`. Built fresh per spec.
 *
 *  Example: `const table = new CharacterTableFake(); table.tokens.rows.push(lyraAnchorRow())` */
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
    castPo(),
    scenePo({ id: QUELM_SCENE_ID, campaignId: QUELM_ID }),
  ]);
  readonly journal = this.scenes.journal;
  readonly tokens = new TokensDaoFake(this.journal, [
    lyraRow(),
    lyraRow({ token: lyraPo({ id: QUELM_TOKEN_ID, sceneId: QUELM_SCENE_ID }) }),
  ]);
  readonly conditions = new ConditionsDaoFake(this.journal);
  readonly combat = new CombatDaoFake(this.journal);
  readonly anchors = new TokenAnchorsDaoFake(this.journal, this.tokens, this.conditions);
  readonly memberCards = new MemberCardsDaoFake(this.journal);
  readonly mainTokens = new MainTokensDaoFake(this.journal);
  readonly publisher = new BoardPublisherFake(this.journal);
  readonly clock = new ClockFake(NOW);
  readonly transaction = new TokenTransactionRunnerFake(
    this.scenes,
    this.tokens,
    this.conditions,
    this.combat,
    undefined,
    new WallsDaoFake([]),
    this.mainTokens,
    this.memberCards,
    this.anchors,
  );

  constructor() {
    this.scenes.activeOf.set(VHARN_ID, VHARN_SCENE_ID);
    this.scenes.activeOf.set(QUELM_ID, QUELM_SCENE_ID);
  }

  /** Envenenado (2 rounds) on `tokenId`, without touching the journal. */
  poison(tokenId: string = LYRA_ID): string {
    const conditionId = this.conditions.define(VHARN_ID, 'Envenenado', 'harm');
    const active = {
      id: `${tokenId}-poison`,
      tokenId,
      conditionId,
      name: 'Envenenado',
      tone: 'harm' as const,
      icon: 'circle-dot' as const,
      look: null,
      color: null,
      description: '',
      maxStacks: null,
      stacks: 1,
      remainingRounds: 2,
      appliedRound: null,
    };
    this.conditions.active.push(active);
    return active.id;
  }

  /** Bia's card already points at Lyra's anchor, which stands in the cast. */
  withLyraAnchor(): void {
    this.tokens.rows.push(lyraAnchorRow());
    this.memberCards.rows.push({
      campaignId: VHARN_ID,
      userId: BIA_ID,
      characterName: null,
      armorClass: null,
      difficultyClass: null,
      noteOne: null,
      noteTwo: null,
      anchorTokenId: LYRA_ANCHOR_ID,
      updatedAt: NOW,
    });
  }
}

export { VHARN_CAST_ID, VHARN_SCENE_ID };
