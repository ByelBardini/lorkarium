import type {
  CampaignDetailDto,
  CampaignSummaryDto,
  CreateCampaignRequestDto,
  JoinCampaignRequestDto,
} from '@lorkarium/contracts';
import type { CampaignJoinService } from '../../src/modules/campaigns/campaign-join.service';
import type { CampaignsService } from '../../src/modules/campaigns/campaigns.service';
import type { CreateLights, LightsService } from '../../src/modules/lights/lights.service';
import type { SceneGrid } from '../../src/modules/scenes/scene-config.bo';
import type { CreatedInScene } from '../../src/modules/scenes/locked-scene';
import type {
  SceneConfigRequest,
  ScenesService,
  VisionChoice,
} from '../../src/modules/scenes/scenes.service';
import type { CreateTokens, TokenBatchService } from '../../src/modules/tokens/token-batch.service';
import type { CreateWalls, WallsService } from '../../src/modules/walls/walls.service';

export const STRESS_CAMPAIGN_ID = '5e1f2a3b-4c5d-4e6f-8a7b-9c0d1e2f3a4b';
export const STRESS_JOIN_CODE = 'STRS7K2Q';

/** The campaigns service of the stress seed: `existing` is what `listMine` answers. */
export class StressCampaignsFake implements Pick<CampaignsService, 'create' | 'listMine'> {
  readonly created: Array<Readonly<{ userId: string; input: CreateCampaignRequestDto }>> = [];

  constructor(private readonly existing: CampaignSummaryDto[] = []) {}

  async create(userId: string, input: CreateCampaignRequestDto): Promise<CampaignDetailDto> {
    this.created.push({ userId, input });
    return { id: STRESS_CAMPAIGN_ID, joinCode: STRESS_JOIN_CODE } as CampaignDetailDto;
  }

  async listMine(): Promise<CampaignSummaryDto[]> {
    return this.existing;
  }
}

/** The join service: records who joined with which code. */
export class StressJoinFake implements Pick<CampaignJoinService, 'join'> {
  readonly joined: Array<Readonly<{ userId: string; code: string }>> = [];

  async join(userId: string, input: JoinCampaignRequestDto): Promise<CampaignSummaryDto> {
    this.joined.push({ userId, code: input.code });
    return { id: STRESS_CAMPAIGN_ID } as CampaignSummaryDto;
  }
}

/** The scenes service: records each configure. */
export class StressScenesFake implements Pick<ScenesService, 'configure'> {
  readonly configured: Array<
    Readonly<{ campaignId: string; grid: SceneGrid; vision: VisionChoice }>
  > = [];

  async configure(
    _userId: string,
    campaignId: string,
    { grid, vision }: SceneConfigRequest,
  ): Promise<number> {
    this.configured.push({ campaignId, grid, vision });
    return 1;
  }
}

/** One batch command the board services received. */
export type StressBatch<T> = Readonly<{ userId: string; campaignId: string; command: T }>;

function createdOf(size: number): CreatedInScene {
  return { version: 1, createdIds: Array.from({ length: size }, () => crypto.randomUUID()) };
}

/** The walls, lights and tokens services: each batch they got, in order. */
export class StressBoardFake {
  readonly walls: StressBatch<CreateWalls>[] = [];
  readonly lights: StressBatch<CreateLights>[] = [];
  readonly tokens: StressBatch<CreateTokens>[] = [];

  readonly wallService: Pick<WallsService, 'createMany'> = {
    createMany: async (userId, campaignId, command) => {
      this.walls.push({ userId, campaignId, command });
      return createdOf(command.walls.length);
    },
  };

  readonly lightService: Pick<LightsService, 'createMany'> = {
    createMany: async (userId, campaignId, command) => {
      this.lights.push({ userId, campaignId, command });
      return createdOf(command.lights.length);
    },
  };

  readonly tokenService: Pick<TokenBatchService, 'createMany'> = {
    createMany: async (userId, campaignId, command) => {
      this.tokens.push({ userId, campaignId, command });
      return createdOf(command.tokens.length);
    },
  };
}
