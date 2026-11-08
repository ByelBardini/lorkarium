import type { CombatEntryInput } from '@lorkarium/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import { CombatService } from '../../../src/modules/combat/combat.service';
import { ClockFake } from '../../support/auth-fakes';
import { ANA_ID } from '../../support/auth-factories';
import { CampaignMembersDaoFake, CampaignsDaoFake } from '../../support/campaigns-fakes';
import { BIA_ID, VHARN_ID, campaignMemberPo } from '../../support/campaigns-factories';
import { CharacterPublisherFake } from '../../support/characters-fakes';
import { CombatDaoFake, CombatTransactionRunnerFake } from '../../support/combat-fakes';
import { ConditionsDaoFake } from '../../support/conditions-fakes';
import { BoardPublisherFake, ScenesDaoFake } from '../../support/scenes-fakes';
import { VHARN_SCENE_ID, scenePo } from '../../support/scenes-factories';
import { TokensDaoFake } from '../../support/tokens-fakes';
import {
  BRAM_ID,
  LOBO_ID,
  LYRA_ID,
  bramRow,
  loboRow,
  lyraPo,
  lyraRow,
  squarePatrolPo,
} from '../../support/tokens-factories';

const NOW = new Date('2026-11-08T12:00:02.500Z');
const STARTED = new Date('2026-11-08T12:00:00.000Z');

function alone(...tokenIds: string[]): CombatEntryInput[] {
  return tokenIds.map((tokenId) => ({ name: null, tokenIds: [tokenId], initiative: null }));
}

/** Lyra walks the 2 × 2 square from (0, 0) since 2.5 s ago (now on (2, 0)); Bram stands still. */
describe('CombatService with a running patrol', () => {
  let tokens: TokensDaoFake;
  let scenes: ScenesDaoFake;
  let publisher: BoardPublisherFake;
  let service: CombatService;

  beforeEach(() => {
    const members = new CampaignMembersDaoFake(new CampaignsDaoFake(), {}, [
      campaignMemberPo({ campaignId: VHARN_ID, userId: ANA_ID, role: 'master' }),
      campaignMemberPo({ campaignId: VHARN_ID, userId: BIA_ID, role: 'player' }),
    ]);
    scenes = new ScenesDaoFake([scenePo({ version: 4 })]);
    scenes.activeOf.set(VHARN_ID, VHARN_SCENE_ID);
    const walking = lyraRow({
      token: lyraPo({ col: 0, row: 0 }),
      patrol: squarePatrolPo({ startedAt: STARTED }),
    });
    tokens = new TokensDaoFake(scenes.journal, [walking, bramRow()]);
    publisher = new BoardPublisherFake(scenes.journal);
    const combat = new CombatDaoFake(scenes.journal);
    const conditions = new ConditionsDaoFake(scenes.journal);
    const transaction = new CombatTransactionRunnerFake({ scenes, tokens, combat, conditions });
    service = new CombatService({
      members,
      transaction: transaction.run,
      publisher,
      characterPublisher: new CharacterPublisherFake(scenes.journal),
      clock: new ClockFake(NOW),
    });
  });

  const pauseOfLyra = { tokenId: LYRA_ID, col: 2, row: 0, facing: 0, step: 2 };

  it('combat:start with Lyra pauses her patrol where she is now, in combat:started', async () => {
    await service.start(ANA_ID, VHARN_ID, { entries: alone(LYRA_ID, BRAM_ID) });

    expect(publisher.combatEvents[0]).toMatchObject({
      name: 'combat:started',
      event: { patrolPauses: [pauseOfLyra] },
    });
    expect(tokens.rowOf(LYRA_ID).patrol).toMatchObject({ step: 2, startedAt: null });
    expect(tokens.rowOf(LYRA_ID).token).toMatchObject({ col: 2, row: 0, facing: 0 });
  });

  it('combat:addCombatants with Lyra pauses her in combat:updated', async () => {
    await service.start(ANA_ID, VHARN_ID, { entries: alone(BRAM_ID) });

    await service.addCombatants(ANA_ID, VHARN_ID, { entries: alone(LYRA_ID) });

    expect(publisher.combatEvents[1]).toMatchObject({
      name: 'combat:updated',
      event: { patrolPauses: [pauseOfLyra] },
    });
  });

  it('a combat of still tokens keeps the event as it always was and writes no pause', async () => {
    await service.start(ANA_ID, VHARN_ID, { entries: alone(BRAM_ID) });

    expect(publisher.combatEvents[0]?.event).not.toHaveProperty('patrolPauses');
    expect(scenes.journal).not.toContain('pausePatrols');
    expect(tokens.rowOf(LYRA_ID).patrol?.startedAt).toEqual(STARTED);
  });

  it('a patrol of a token left out of the combat keeps running', async () => {
    await service.start(ANA_ID, VHARN_ID, { entries: alone(BRAM_ID) });
    await service.addCombatants(ANA_ID, VHARN_ID, {
      entries: [{ name: 'Covil', tokenIds: [], initiative: null }],
    });

    expect(tokens.rowOf(LYRA_ID).patrol?.startedAt).toEqual(STARTED);
  });

  it('the hidden Lobo with a torch pausing: the rest loses its pause and gets its light stopped', async () => {
    const lobo = loboRow({
      token: { ...loboRow().token, col: 0, row: 0 },
      patrol: squarePatrolPo({ tokenId: LOBO_ID, startedAt: STARTED }),
    });
    tokens.rows.push(lobo);

    await service.start(ANA_ID, VHARN_ID, { entries: alone(LOBO_ID, BRAM_ID) });

    const rest = publisher.veilOf('combatStarted')?.at(-1) as
      { event: { patrolPauses?: unknown } | null } | undefined;
    expect(rest?.event?.patrolPauses).toBeUndefined();
    const lights = publisher.veiledLightsChanges[0]?.cuts.at(-1)?.lights ?? [];
    expect(lights).toEqual([expect.objectContaining({ x: 3, y: 1 })]);
    expect(lights[0]).not.toHaveProperty('walk');
  });
});
