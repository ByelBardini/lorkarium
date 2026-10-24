import { beforeEach, describe, expect, it } from 'vitest';
import { MemberCardsService } from '../../../src/modules/member-cards/member-cards.service';
import { ClockFake } from '../../support/auth-fakes';
import { ANA_ID } from '../../support/auth-factories';
import { CampaignMembersDaoFake, CampaignsDaoFake } from '../../support/campaigns-fakes';
import {
  BIA_ID,
  CAIO_ID,
  QUELM_ID,
  VHARN_ID,
  campaignMemberPo,
} from '../../support/campaigns-factories';
import { memberCardPo } from '../../support/member-cards-factories';
import {
  MemberCardTransactionRunnerFake,
  MemberCardsDaoFake,
} from '../../support/member-cards-fakes';
import { BoardPublisherFake, ScenesDaoFake } from '../../support/scenes-fakes';
import { VHARN_CAST_ID, VHARN_SCENE_ID, castPo, scenePo } from '../../support/scenes-factories';
import { TORRE_ID, torrePo } from '../../support/library-factories';

const NOW = new Date('2026-10-22T21:00:00Z');
const STRANGER_ID = 'f1e2d3c4-b5a6-4978-8a9b-0c1d2e3f4a5b';

describe('MemberCardsService.update', () => {
  let scenes: ScenesDaoFake;
  let memberCards: MemberCardsDaoFake;
  let publisher: BoardPublisherFake;
  let service: MemberCardsService;

  beforeEach(() => {
    const members = new CampaignMembersDaoFake(new CampaignsDaoFake(), {}, [
      campaignMemberPo({ campaignId: VHARN_ID, userId: ANA_ID, role: 'master' }),
      campaignMemberPo({ campaignId: VHARN_ID, userId: BIA_ID, role: 'player' }),
      campaignMemberPo({ campaignId: VHARN_ID, userId: CAIO_ID, role: 'player' }),
    ]);
    scenes = new ScenesDaoFake([
      scenePo({ version: 7 }),
      torrePo({ version: 2 }),
      castPo({ version: 3 }),
    ]);
    scenes.activeOf.set(VHARN_ID, VHARN_SCENE_ID);
    memberCards = new MemberCardsDaoFake(scenes.journal, [
      memberCardPo({ noteOne: 'Percepção passiva 14' }),
    ]);
    publisher = new BoardPublisherFake(scenes.journal);
    const transaction = new MemberCardTransactionRunnerFake(scenes, members, memberCards);
    service = new MemberCardsService({
      members,
      transaction: transaction.run,
      publisher,
      clock: new ClockFake(NOW),
    });
  });

  it('Bia changing her armor class locks the cast, saves, bumps it, commits and then publishes the whole card', async () => {
    const version = await service.update(BIA_ID, VHARN_ID, {
      memberId: BIA_ID,
      changes: { armorClass: 15 },
    });

    expect(version).toBe(4);
    expect(scenes.journal).toEqual(['lock cast', 'save', 'bump cast', 'commit', 'publish']);
    expect(publisher.memberCardChanges).toEqual([
      {
        campaignId: VHARN_ID,
        sceneId: VHARN_CAST_ID,
        version: 4,
        at: NOW.toISOString(),
        card: {
          userId: BIA_ID,
          characterName: null,
          armorClass: 15,
          difficultyClass: null,
          noteOne: 'Percepção passiva 14',
          noteTwo: null,
          anchorTokenId: null,
        },
      },
    ]);
  });

  it('Ana, the master, writes the first note of Bia', async () => {
    await service.update(ANA_ID, VHARN_ID, { memberId: BIA_ID, changes: { noteOne: 'Ferida' } });

    expect(memberCards.rows).toEqual([
      expect.objectContaining({ userId: BIA_ID, noteOne: 'Ferida' }),
    ]);
  });

  it('Caio changing the card of Bia is FORBIDDEN: nothing saved, bumped or published', async () => {
    const update = service.update(CAIO_ID, VHARN_ID, {
      memberId: BIA_ID,
      changes: { armorClass: 3 },
    });

    await expect(update).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(scenes.journal).toEqual(['lock cast']);
    expect(memberCards.rows[0]?.armorClass).toBeNull();
    expect(publisher.memberCardChanges).toEqual([]);
  });

  it('a memberId outside the table is MEMBER_NOT_FOUND: nothing saved, bumped or published', async () => {
    const update = service.update(ANA_ID, VHARN_ID, {
      memberId: STRANGER_ID,
      changes: { armorClass: 3 },
    });

    await expect(update).rejects.toMatchObject({ code: 'MEMBER_NOT_FOUND' });
    expect(scenes.journal).toEqual(['lock cast']);
    expect(publisher.memberCardChanges).toEqual([]);
  });

  it('someone who is not a member of the table is CAMPAIGN_NOT_FOUND without locking the scene', async () => {
    const update = service.update(BIA_ID, QUELM_ID, {
      memberId: BIA_ID,
      changes: { armorClass: 3 },
    });

    await expect(update).rejects.toMatchObject({ code: 'CAMPAIGN_NOT_FOUND' });
    expect(scenes.journal).toEqual([]);
  });

  it('a card changed with the Torre named stays on the cast: neither the Torre nor the group grid is locked or bumped', async () => {
    const version = await service.update(BIA_ID, VHARN_ID, {
      sceneId: TORRE_ID,
      memberId: BIA_ID,
      changes: { armorClass: 15 },
    });

    expect(version).toBe(4);
    expect(scenes.journal).toEqual(['lock cast', 'save', 'bump cast', 'commit', 'publish']);
    expect(scenes.rows.map(({ version }) => version)).toEqual([7, 2, 4]);
    expect(publisher.memberCardChanges[0]).toMatchObject({ sceneId: VHARN_CAST_ID, version: 4 });
  });
});
