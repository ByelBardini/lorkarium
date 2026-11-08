import { beforeEach, describe, expect, it } from 'vitest';
import { WallsService } from '../../../src/modules/walls/walls.service';
import { ClockFake } from '../../support/auth-fakes';
import { ANA_ID } from '../../support/auth-factories';
import { CampaignMembersDaoFake, CampaignsDaoFake } from '../../support/campaigns-fakes';
import { BIA_ID, VHARN_ID, campaignMemberPo } from '../../support/campaigns-factories';
import { LightsDaoFake } from '../../support/lights-fakes';
import { BoardPublisherFake, ScenesDaoFake } from '../../support/scenes-fakes';
import { scenePo } from '../../support/scenes-factories';
import { TokensDaoFake } from '../../support/tokens-fakes';
import { lyraPo, lyraRow, squarePatrolPo } from '../../support/tokens-factories';
import { SceneWallsFake, WallsDaoFake, WallTransactionRunnerFake } from '../../support/walls-fakes';
import { CELL_DOOR_ID, cellDoorPo } from '../../support/walls-factories';

const NOW = new Date('2026-11-08T12:00:20.000Z');
const STARTED = new Date('2026-11-08T12:00:00.000Z');
// Bia's Lyra sees 6 cells in the dark. Stored at (5, 5), beside the cell door (x = 7); her
// route is far, on (18, 0)–(19, 0), and 20 s after starting she walks it, out of reach.
const NEAR_THE_DOOR = { col: 5, row: 5, sightBright: '6.00', sightDim: '0.00' };
const FAR_ROUTE: [number, number][] = [
  [18, 0],
  [19, 0],
];

describe('WallsService.setDoor with a patrolling eye', () => {
  let walls: WallsDaoFake;
  let tokens: TokensDaoFake;
  let service: WallsService;

  beforeEach(() => {
    const members = new CampaignMembersDaoFake(new CampaignsDaoFake(), {}, [
      campaignMemberPo({ campaignId: VHARN_ID, userId: ANA_ID, role: 'master' }),
      campaignMemberPo({ campaignId: VHARN_ID, userId: BIA_ID, role: 'player' }),
    ]);
    const scenes = new ScenesDaoFake([scenePo({ visionMode: 'dark' })]);
    scenes.activeOf.set(VHARN_ID, scenes.rows[0]!.id);
    walls = new WallsDaoFake(scenes.journal, [cellDoorPo()]);
    const patrol = squarePatrolPo({ path: FAR_ROUTE, repeat: 'bounce', startedAt: STARTED });
    tokens = new TokensDaoFake(scenes.journal, [lyraRow({ token: lyraPo(NEAR_THE_DOOR), patrol })]);
    const lights = new LightsDaoFake(scenes.journal, []);
    service = new WallsService({
      members,
      transaction: new WallTransactionRunnerFake(scenes, walls, tokens, lights).run,
      publisher: new BoardPublisherFake(scenes.journal),
      clock: new ClockFake(NOW),
      sceneWalls: new SceneWallsFake(),
      limits: { walls: 500, segments: 4000 },
    });
  });

  const biaOpens = () => service.setDoor(BIA_ID, VHARN_ID, { wallId: CELL_DOOR_ID, state: 'open' });

  it('Lyra patrolling far from the door does not see it from where she started: FORBIDDEN', async () => {
    await expect(biaOpens()).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: expect.stringContaining(`set door ${CELL_DOOR_ID} out of sight`),
    });
    expect(walls.rows[0]?.doorState).toBe('closed');
  });

  it('the same Lyra with the patrol paused sees it from (5, 5) and opens it', async () => {
    tokens.store(tokens.rows[0]!.token.id, (row) => ({
      ...row,
      patrol: row.patrol && { ...row.patrol, startedAt: null },
    }));

    await biaOpens();

    expect(walls.rows[0]?.doorState).toBe('open');
  });
});
