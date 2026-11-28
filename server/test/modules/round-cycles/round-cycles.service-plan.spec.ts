import { beforeEach, describe, expect, it } from 'vitest';
import {
  RoundCyclesService,
  type DefineRoundCycle,
} from '../../../src/modules/round-cycles/round-cycles.service';
import { newAssetPo } from '../../support/assets-factories';
import { AssetsDaoFake } from '../../support/assets-fakes';
import { ClockFake } from '../../support/auth-fakes';
import { campaignMemberPo } from '../../support/campaigns-factories';
import { MembershipReadsFake } from '../../support/campaigns-fakes';
import { CharactersDaoFake } from '../../support/characters-fakes';
import { planAccount } from '../../support/plan-account-fakes';
import {
  RoundCyclePublisherFake,
  RoundCycleTransactionRunnerFake,
  RoundCyclesDaoFake,
} from '../../support/round-cycles-fakes';

const VHARN = 'campaign-vharn';
const GM = 'user-gm';
const NOW = new Date('2026-11-27T12:00:00Z');

const phasesNamed = (names: readonly string[], imageAssetId: string | null = null) =>
  names.map((name) => ({ name, icon: 'game-icons:moon-orbit' as const, imageAssetId }));

const tide = (overrides: Partial<DefineRoundCycle> = {}): DefineRoundCycle => ({
  name: 'Maré',
  holder: { kind: 'table' },
  visibility: 'everyone',
  seerIds: [],
  chooserIds: [],
  announce: false,
  phases: phasesNamed(['Baixa', 'Subindo', 'Alta']),
  ...overrides,
});

describe('RoundCyclesService and the plan of the table owner', () => {
  let journal: string[];
  let characters: CharactersDaoFake;
  let cycles: RoundCyclesDaoFake;
  let assets: AssetsDaoFake;
  let publisher: RoundCyclePublisherFake;
  let service: RoundCyclesService;

  beforeEach(() => {
    journal = [];
    characters = new CharactersDaoFake(journal, [], { [VHARN]: 4 });
    cycles = new RoundCyclesDaoFake(journal);
    assets = new AssetsDaoFake();
    publisher = new RoundCyclePublisherFake(journal);
    const members = new MembershipReadsFake([
      campaignMemberPo({ campaignId: VHARN, userId: GM, role: 'master' }),
    ]);
    const transaction = new RoundCycleTransactionRunnerFake(characters, cycles, assets).run;
    service = new RoundCyclesService({
      members,
      transaction,
      publisher,
      clock: new ClockFake(NOW),
    });
  });

  const ownerOn = (plan: 'free' | 'narrador' | 'amigo_do_dono'): void => {
    characters.owners.set(VHARN, planAccount({ plan }));
  };

  it('a Grátis table takes one cycle; the 2nd is PLAN_LIMIT and nothing is published', async () => {
    ownerOn('free');
    await service.define(GM, VHARN, tide());
    journal.length = 0;

    await expect(service.define(GM, VHARN, tide({ name: 'Céu' }))).rejects.toMatchObject({
      code: 'PLAN_LIMIT',
      resource: 'roundCycles',
      limit: 1,
    });
    expect(journal).toEqual(['lock characters']);
    expect(cycles.rows).toHaveLength(1);
  });

  it('a Grátis table refuses a cycle of 4 phases before writing it', async () => {
    ownerOn('free');
    const phases = phasesNamed(['Nova', 'Crescente', 'Cheia', 'Minguante']);

    await expect(service.define(GM, VHARN, tide({ phases }))).rejects.toMatchObject({
      resource: 'roundCyclePhases',
      limit: 3,
    });
    expect(cycles.rows).toEqual([]);
  });

  it('a Grátis table refuses a phase with an image; a Narrador table takes it', async () => {
    const image = await assets.insert(newAssetPo({ campaignId: VHARN }));
    const phases = phasesNamed(['Baixa', 'Alta'], image.id);
    ownerOn('free');
    await expect(service.define(GM, VHARN, tide({ phases }))).rejects.toMatchObject({
      resource: 'roundCyclePhaseImage',
    });

    ownerOn('narrador');
    await service.define(GM, VHARN, tide({ phases }));
    expect(cycles.rows[0]?.phases.map(({ imageAssetId }) => imageAssetId)).toEqual([
      image.id,
      image.id,
    ]);
  });

  it('after the plan went down, the newer cycles are planLocked and their edit is readOnly', async () => {
    await service.define(GM, VHARN, tide());
    await service.define(GM, VHARN, tide({ name: 'Céu' }));
    ownerOn('free');
    const [oldest, newer] = cycles.rows;

    await expect(
      service.update(GM, VHARN, { ...tide({ name: 'Céu 2' }), cycleId: newer!.cycle.id }),
    ).rejects.toMatchObject({ code: 'PLAN_LIMIT', reason: 'readOnly', resource: 'roundCycles' });
    await service.update(GM, VHARN, { ...tide({ name: 'Maré 2' }), cycleId: oldest!.cycle.id });

    const listed = publisher.changes.at(-1)?.cuts.masters;
    expect(listed?.map(({ name, planLocked }) => [name, planLocked])).toEqual([
      ['Maré 2', false],
      ['Céu', true],
    ]);
  });

  it('a locked cycle can still be deleted', async () => {
    await service.define(GM, VHARN, tide());
    await service.define(GM, VHARN, tide({ name: 'Céu' }));
    ownerOn('free');

    await service.delete(GM, VHARN, { cycleId: cycles.rows[1]!.cycle.id });
    expect(cycles.rows.map(({ cycle }) => cycle.name)).toEqual(['Maré']);
  });

  it('a Grátis edit keeps the image a phase already had, and refuses a new one', async () => {
    const image = await assets.insert(newAssetPo({ campaignId: VHARN }));
    const other = await assets.insert(newAssetPo({ campaignId: VHARN }));
    await service.define(GM, VHARN, tide({ phases: phasesNamed(['Baixa', 'Alta'], image.id) }));
    ownerOn('free');
    const saved = cycles.rows[0]!;
    const kept = saved.phases.map(({ id, name, icon, imageAssetId }) => ({
      id,
      name,
      icon,
      imageAssetId,
    }));
    const cycleId = saved.cycle.id;

    await service.update(GM, VHARN, { ...tide({ phases: kept }), cycleId });
    const swapped = kept.map((phase) => ({ ...phase, imageAssetId: other.id }));
    await expect(
      service.update(GM, VHARN, { ...tide({ phases: swapped }), cycleId }),
    ).rejects.toMatchObject({ resource: 'roundCyclePhaseImage' });
  });
});
