import { beforeEach, describe, expect, it } from 'vitest';
import { BoardService, type BoardReadDaos } from '../../../src/modules/board/board.service';
import { ClockFake } from '../../support/auth-fakes';
import { ANA_ID } from '../../support/auth-factories';
import { CampaignMembersDaoFake, CampaignsDaoFake } from '../../support/campaigns-fakes';
import { BIA_ID, CAIO_ID, VHARN_ID, campaignMemberPo } from '../../support/campaigns-factories';
import { CombatDaoFake, soloEntries } from '../../support/combat-fakes';
import { ConditionsDaoFake } from '../../support/conditions-fakes';
import { DrawingsDaoFake } from '../../support/drawings-fakes';
import { EffectAreasDaoFake } from '../../support/effect-areas-fakes';
import { LightsDaoFake } from '../../support/lights-fakes';
import { ScenesDaoFake } from '../../support/scenes-fakes';
import { VHARN_SCENE_ID, scenePo } from '../../support/scenes-factories';
import { TokensDaoFake } from '../../support/tokens-fakes';
import {
  LOBO_ID,
  LYRA_ID,
  loboRow,
  lyraRow,
  sombraRow,
  SOMBRA_ID,
} from '../../support/tokens-factories';
import { WallsDaoFake } from '../../support/walls-fakes';

const NOW = new Date('2026-10-24T21:00:00Z');
const TORCH = { x: 4, y: 5, bright: 4, dim: 4, color: 'torch', facing: 0, angle: 360 };

describe('BoardService.snapshotFor with hidden tokens', () => {
  let combat: CombatDaoFake;
  let service: BoardService;

  beforeEach(async () => {
    const members = new CampaignMembersDaoFake(new CampaignsDaoFake(), {}, [
      campaignMemberPo({ campaignId: VHARN_ID, userId: ANA_ID, role: 'master' }),
      campaignMemberPo({ campaignId: VHARN_ID, userId: BIA_ID, role: 'player' }),
      campaignMemberPo({ campaignId: VHARN_ID, userId: CAIO_ID, role: 'player' }),
    ]);
    const scenes = new ScenesDaoFake([scenePo({ version: 7 })]);
    scenes.activeOf.set(VHARN_ID, VHARN_SCENE_ID);
    const journal: string[] = [];
    combat = new CombatDaoFake(journal);
    await combat.start(VHARN_SCENE_ID, soloEntries(LOBO_ID, LYRA_ID));
    const daos: BoardReadDaos = {
      scenes,
      tokens: new TokensDaoFake(journal, [lyraRow(), loboRow(), sombraRow()]),
      conditions: new ConditionsDaoFake(),
      combat,
      drawings: new DrawingsDaoFake(journal),
      effectAreas: new EffectAreasDaoFake(journal),
      walls: new WallsDaoFake(journal),
      lights: new LightsDaoFake(journal),
    };
    service = new BoardService({
      members,
      snapshot: (work) => work(daos),
      clock: new ClockFake(NOW),
    });
  });

  it('Caio gets neither the Lobo nor the Sombra, nor them in the combat', async () => {
    const state = await service.snapshotFor(CAIO_ID, VHARN_ID);

    expect(state.tokens.map(({ id }) => id)).toEqual([LYRA_ID]);
    expect(state.combat?.combatants.map(({ tokenIds }) => tokenIds)).toEqual([[LYRA_ID]]);
    expect(JSON.stringify(state)).not.toContain(LOBO_ID);
    expect(JSON.stringify(state)).not.toContain(SOMBRA_ID);
  });

  it('Caio gets the torch of the Lobo as a veiled light (the Sombra has none)', async () => {
    expect((await service.snapshotFor(CAIO_ID, VHARN_ID)).veiledLights).toEqual([TORCH]);
  });

  it('the turn on the hidden Lobo is nobody on the turn for Caio', async () => {
    const row = await combat.findOfScene(VHARN_SCENE_ID);
    const loboEntry = row?.combatants.find(({ tokenIds }) => tokenIds.includes(LOBO_ID));
    await combat.setTurn(row?.combat.id ?? '', 1, loboEntry?.id ?? null);

    expect((await service.snapshotFor(CAIO_ID, VHARN_ID)).combat?.currentCombatantId).toBeNull();
    expect((await service.snapshotFor(BIA_ID, VHARN_ID)).combat?.currentCombatantId).toBe(
      loboEntry?.id,
    );
  });

  it('Bia, who controls the Lobo, gets it and not its light; the Sombra stays out', async () => {
    const state = await service.snapshotFor(BIA_ID, VHARN_ID);

    expect(state.tokens.map(({ id }) => id)).toEqual([LYRA_ID, LOBO_ID]);
    expect(state.veiledLights).toEqual([]);
  });

  it('Ana, the master, gets every token and no veiled light', async () => {
    const state = await service.snapshotFor(ANA_ID, VHARN_ID);

    expect(state.tokens.map(({ id }) => id)).toEqual([LYRA_ID, LOBO_ID, SOMBRA_ID]);
    expect(state.tokens.filter(({ hidden }) => hidden)).toHaveLength(2);
    expect(state.veiledLights).toEqual([]);
    expect(state.combat?.combatants).toHaveLength(2);
  });
});
