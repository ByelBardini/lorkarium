import type { DiceRollCommandDto } from '@lorkarium/contracts';
import { memberColorOf } from '@lorkarium/game-core';
import { describe, expect, it } from 'vitest';
import {
  CampaignNotFoundError,
  ForbiddenActionError,
} from '../../../src/modules/campaigns/campaigns.error';
import { InvalidDiceExpressionError } from '../../../src/modules/dice/dice.error';
import { DiceService } from '../../../src/modules/dice/dice.service';
import { ClockFake } from '../../support/auth-fakes';
import { ANA_ID } from '../../support/auth-factories';
import { MembershipReadsFake } from '../../support/campaigns-fakes';
import {
  BIA_ID,
  DUDA_ID,
  QUELM_ID,
  VHARN_ID,
  campaignMemberPo,
} from '../../support/campaigns-factories';
import { DicePhysicsFake, DicePublisherFake, DiceRandomFake } from '../../support/dice-fakes';
import { ProfilesDaoFake, profileRow } from '../../support/profiles-fakes';

const NOW = new Date('2026-10-25T12:00:00Z');
const ROLL_ID = '6a1d2c3b-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const TEXTURE_ID = '2b3c4d5e-6f70-4812-9a3b-4c5d6e7f8091';
const ACTION_ID = '0f8b5b8e-1c1f-4d7c-9a51-6b3c2d1e0f9a';

type Harness = Readonly<{
  service: DiceService;
  physics: DicePhysicsFake;
  random: DiceRandomFake;
  publisher: DicePublisherFake;
}>;

function harness(physicsValues: number[] = [], faces: number[] = []): Harness {
  const members = new MembershipReadsFake([
    campaignMemberPo({ userId: ANA_ID, role: 'master' }),
    campaignMemberPo({ userId: BIA_ID, role: 'player' }),
    campaignMemberPo({ userId: DUDA_ID, role: 'spectator' }),
  ]);
  const profiles = new ProfilesDaoFake([
    profileRow(),
    profileRow({
      id: BIA_ID,
      color: 'rose',
      diceTextureId: TEXTURE_ID,
      diceNumberColor: '#fafafa',
    }),
  ]);
  const physics = new DicePhysicsFake(physicsValues);
  const random = new DiceRandomFake(faces);
  const publisher = new DicePublisherFake();
  const clock = new ClockFake(NOW);
  const deps = { members, profiles, physics, random, publisher, clock, newId: () => ROLL_ID };
  return { service: new DiceService(deps), physics, random, publisher };
}

function rollOf(
  expressions: string[],
  overrides: Partial<DiceRollCommandDto> = {},
): DiceRollCommandDto {
  return {
    actionId: ACTION_ID,
    campaignId: VHARN_ID,
    label: null,
    parts: expressions.map((expression) => ({ label: null, expression })),
    visibility: 'public',
    aspect: 16 / 9,
    ...overrides,
  };
}

describe('DiceService.roll', () => {
  it('Bia rolls 1d20+5 in public: the physics throws one d20 with her aspect, 17 gives 22', async () => {
    const { service, physics, publisher } = harness([17]);

    const answer = await service.roll(BIA_ID, rollOf(['1d20+5'], { label: 'Acerto' }));

    expect(answer).toEqual({ rollId: ROLL_ID });
    expect(physics.throws).toEqual([{ kinds: ['d20'], aspect: 16 / 9, startMs: 0 }]);
    expect(publisher.journal).toEqual(['publish:full:table']);
    expect(publisher.full[0]).toMatchObject({
      campaignId: VHARN_ID,
      rollId: ROLL_ID,
      rollerId: BIA_ID,
      label: 'Acerto',
      total: 22,
      appearance: { color: 'rose', textureId: TEXTURE_ID, numberColor: '#fafafa' },
      settlesInMs: 1500,
      at: '2026-10-25T12:00:00.000Z',
    });
  });

  it('Ana without a chosen color rolls with her automatic one and no texture', async () => {
    const { service, publisher } = harness([3]);

    await service.roll(ANA_ID, rollOf(['1d6']));

    expect(publisher.full[0]?.appearance).toEqual({
      color: memberColorOf(ANA_ID, null),
      textureId: null,
      numberColor: null,
    });
  });

  it('25d6: 20 dice go to the physics and 5 to crypto', async () => {
    const { service, physics, random } = harness();

    await service.roll(BIA_ID, rollOf(['25d6']));

    expect(physics.throws[0]?.kinds).toHaveLength(20);
    expect(random.asked).toEqual([6, 6, 6, 6, 6]);
  });

  it('1d7 never calls the physics: crypto draws it and the "…" lasts 800 ms', async () => {
    const { service, physics, random, publisher } = harness([], [4]);

    await service.roll(BIA_ID, rollOf(['1d7']));

    expect(physics.throws).toEqual([]);
    expect(random.asked).toEqual([7]);
    expect(publisher.full[0]).toMatchObject({ total: 4, throw: null, settlesInMs: 800 });
  });

  it('1d6! landing 6 throws a 2nd wave 300 ms after the 1st settles', async () => {
    const { service, physics, publisher } = harness([6, 2]);

    await service.roll(BIA_ID, rollOf(['1d6!']));

    expect(physics.throws.map((request) => request.startMs)).toEqual([0, 1800]);
    expect(publisher.full[0]).toMatchObject({ total: 8, settlesInMs: 3300 });
  });

  it('1d100 throws tens and units: 40 and 7 give 47', async () => {
    const { service, physics, publisher } = harness([40, 7]);

    await service.roll(BIA_ID, rollOf(['1d100']));

    expect(physics.throws[0]?.kinds).toEqual(['d100tens', 'd10']);
    expect(publisher.full[0]?.parts[0]?.dice).toEqual([
      { sides: 100, value: 47, status: 'kept', model: [0, 1] },
    ]);
  });

  it('Bia rolls for the masters: the full roll to the masters and Bia, a notice to the rest', async () => {
    const { service, publisher } = harness([12]);

    await service.roll(BIA_ID, rollOf(['1d20'], { visibility: 'masters' }));

    expect(publisher.journal).toEqual([`publish:full:masters+${BIA_ID}`, 'publish:secret']);
    expect(publisher.secret).toEqual([
      {
        campaignId: VHARN_ID,
        rollId: ROLL_ID,
        rollerId: BIA_ID,
        settlesInMs: 1500,
        at: '2026-10-25T12:00:00.000Z',
      },
    ]);
  });

  it('Ana (master) rolls for the masters: the full roll only to the masters', async () => {
    const { service, publisher } = harness([12]);

    await service.roll(ANA_ID, rollOf(['1d20'], { visibility: 'masters' }));

    expect(publisher.journal).toEqual(['publish:full:masters', 'publish:secret']);
  });

  it('Duda (spectator) is FORBIDDEN: no physics and nothing published', async () => {
    const { service, physics, publisher } = harness();

    await expect(service.roll(DUDA_ID, rollOf(['1d20']))).rejects.toBeInstanceOf(
      ForbiddenActionError,
    );
    expect([physics.throws, publisher.journal]).toEqual([[], []]);
  });

  it('a table Bia is not at is CAMPAIGN_NOT_FOUND', async () => {
    const { service, publisher } = harness();

    const roll = service.roll(BIA_ID, rollOf(['1d20'], { campaignId: QUELM_ID }));

    await expect(roll).rejects.toBeInstanceOf(CampaignNotFoundError);
    expect(publisher.journal).toEqual([]);
  });

  it("'2d' is INVALID_DICE_EXPRESSION naming part 1 with the game-core reason", async () => {
    const { service, physics } = harness();

    const roll = service.roll(BIA_ID, rollOf(['2d']));

    await expect(roll).rejects.toBeInstanceOf(InvalidDiceExpressionError);
    await expect(roll).rejects.toThrow(
      'part 1 ("2d") cannot be read: Expected the number of sides at position 2; got the end of the expression.',
    );
    expect(physics.throws).toEqual([]);
  });
});
