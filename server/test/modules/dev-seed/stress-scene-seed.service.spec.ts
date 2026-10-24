import type { CampaignSummaryDto } from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import { StressSceneSeedService } from '../../../src/modules/dev-seed/stress-scene-seed.service';
import { STRESS_CAMPAIGN_NAME } from '../../../src/modules/dev-seed/stress-scene.bo';
import { userPo } from '../../support/auth-factories';
import { UsersDaoFake } from '../../support/auth-fakes';
import {
  STRESS_CAMPAIGN_ID,
  STRESS_JOIN_CODE,
  StressBoardFake,
  StressCampaignsFake,
  StressJoinFake,
  StressRolesFake,
  StressScenesFake,
} from '../../support/dev-seed-fakes';

const BIA = userPo({ name: 'Bia', email: 'bia@lorkarium.dev' });
const CAIO = userPo({
  id: '0b1c2d3e-4f50-4a61-8b72-9c83d4e5f6a7',
  name: 'Caio',
  email: 'caio@lorkarium.dev',
});

function seedWith(existing: CampaignSummaryDto[] = [], users = [BIA, CAIO]) {
  const campaigns = new StressCampaignsFake(existing);
  const join = new StressJoinFake();
  const roles = new StressRolesFake();
  const scenes = new StressScenesFake();
  const board = new StressBoardFake();
  const service = new StressSceneSeedService({
    users: new UsersDaoFake(users),
    campaigns,
    join,
    roles,
    scenes,
    walls: board.wallService,
    lights: board.lightService,
    tokens: board.tokenService,
  });
  return { service, campaigns, join, roles, scenes, board };
}

describe('StressSceneSeedService', () => {
  it('creates the table as Bia, lets Caio in by the code and fills the dark scene', async () => {
    const { service, campaigns, join, roles, scenes } = seedWith();
    const result = await service.seed('development');
    expect(result).toEqual({ campaignId: STRESS_CAMPAIGN_ID, created: true });
    expect(campaigns.created).toEqual([
      { userId: BIA.id, input: expect.objectContaining({ name: STRESS_CAMPAIGN_NAME }) },
    ]);
    expect(join.joined).toEqual([{ userId: CAIO.id, code: STRESS_JOIN_CODE }]);
    expect(roles.changed).toEqual([
      { userId: BIA.id, campaignId: STRESS_CAMPAIGN_ID, targetId: CAIO.id, role: 'player' },
    ]);
    expect(scenes.configured).toEqual([
      {
        campaignId: STRESS_CAMPAIGN_ID,
        grid: expect.objectContaining({ widthCells: 100 }),
        vision: 'dark',
      },
    ]);
  });

  it('sends the 300 tokens in batches of at most 64, as Bia, two of them Caio’s', async () => {
    const { service, board } = seedWith();
    await service.seed('development');
    const sizes = board.tokens.map(({ command }) => command.tokens.length);
    expect(sizes).toEqual([64, 64, 64, 64, 44]);
    expect(board.tokens.every(({ userId }) => userId === BIA.id)).toBe(true);
    const caios = board.tokens
      .flatMap(({ command }) => command.tokens)
      .filter(({ controllerIds }) => controllerIds.includes(CAIO.id));
    expect(caios).toHaveLength(2);
  });

  it('sends the 300 walls and the 40 lights in batches of at most 64', async () => {
    const { service, board } = seedWith();
    await service.seed('development');
    expect(board.walls.map(({ command }) => command.walls.length)).toEqual([64, 64, 64, 64, 44]);
    expect(board.lights.map(({ command }) => command.lights.length)).toEqual([40]);
  });

  it('with Bia’s stress table already there, creates nothing (idempotent)', async () => {
    const existing = {
      id: STRESS_CAMPAIGN_ID,
      name: STRESS_CAMPAIGN_NAME,
      myRole: 'master',
    } as CampaignSummaryDto;
    const { service, campaigns, board } = seedWith([existing]);
    const result = await service.seed('development');
    expect(result).toEqual({ campaignId: STRESS_CAMPAIGN_ID, created: false });
    expect(campaigns.created).toEqual([]);
    expect(board.tokens).toEqual([]);
  });

  it('in production it refuses before touching anything, citing the value received', async () => {
    const { service, campaigns } = seedWith();
    await expect(service.seed('production')).rejects.toThrow(
      expect.objectContaining({ code: 'STRESS_SEED_REFUSED' }),
    );
    expect(campaigns.created).toEqual([]);
  });

  it('without the dev players, refuses naming the missing e-mail and pnpm db:seed-dev', async () => {
    const { service } = seedWith([], [BIA]);
    await expect(service.seed('development')).rejects.toThrow(
      /caio@lorkarium\.dev.*pnpm db:seed-dev/,
    );
  });
});
