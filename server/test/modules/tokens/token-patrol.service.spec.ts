import { beforeEach, describe, expect, it } from 'vitest';
import type { TokenPatrolFieldsDto } from '@lorkarium/contracts';
import { TokenPatrolService } from '../../../src/modules/tokens/token-patrol.service';
import type { TokenRow } from '../../../src/modules/tokens/tokens.dao';
import { ClockFake } from '../../support/auth-fakes';
import { ANA_ID } from '../../support/auth-factories';
import { CampaignMembersDaoFake, CampaignsDaoFake } from '../../support/campaigns-fakes';
import { BIA_ID, VHARN_ID, campaignMemberPo } from '../../support/campaigns-factories';
import { BoardPublisherFake, ScenesDaoFake } from '../../support/scenes-fakes';
import { VHARN_SCENE_ID, scenePo } from '../../support/scenes-factories';
import { TokenTransactionRunnerFake, TokensDaoFake } from '../../support/tokens-fakes';
import {
  BRAM_ID,
  LOBO_ID,
  LYRA_ID,
  SOMBRA_ID,
  bramRow,
  loboRow,
  lyraPo,
  lyraRow,
  sombraRow,
  squarePatrolPo,
} from '../../support/tokens-factories';

const STARTED = new Date('2026-11-08T12:00:00.000Z');
const NOW = new Date('2026-11-08T12:00:02.500Z');
const TORRE_ID = 'torre-scene';
const GUARD_ID = 'guard-of-the-torre';
const OGRO_ID = 'ogro-without-route';

const ROUTE: TokenPatrolFieldsDto = {
  path: [
    [4, 4],
    [8, 4],
  ],
  repeat: 'loop',
  speed: 1,
  turns: true,
  gait: 'glide',
};

/** Lyra on (0, 0) walking the square: running since 2.5 s ago, or paused. */
function walkingLyra(startedAt: Date | null = STARTED): TokenRow {
  return lyraRow({ token: lyraPo({ col: 0, row: 0 }), patrol: squarePatrolPo({ startedAt }) });
}

function rowWith(id: string, patrol: TokenRow['patrol'], sceneId = VHARN_SCENE_ID): TokenRow {
  return lyraRow({ token: lyraPo({ id, sceneId, col: 0, row: 0 }), patrol });
}

describe('TokenPatrolService', () => {
  let scenes: ScenesDaoFake;
  let tokens: TokensDaoFake;
  let publisher: BoardPublisherFake;
  let service: TokenPatrolService;

  function setUp(rows: TokenRow[]): void {
    const members = new CampaignMembersDaoFake(new CampaignsDaoFake(), {}, [
      campaignMemberPo({ campaignId: VHARN_ID, userId: ANA_ID, role: 'master' }),
      campaignMemberPo({ campaignId: VHARN_ID, userId: BIA_ID, role: 'player' }),
    ]);
    scenes = new ScenesDaoFake([
      scenePo({ version: 7 }),
      scenePo({ id: TORRE_ID, campaignId: VHARN_ID, name: 'Torre' }),
    ]);
    scenes.activeOf.set(VHARN_ID, VHARN_SCENE_ID);
    tokens = new TokensDaoFake(scenes.journal, rows);
    publisher = new BoardPublisherFake(scenes.journal);
    const transaction = new TokenTransactionRunnerFake(scenes, tokens).run;
    const clock = new ClockFake(NOW);
    service = new TokenPatrolService({ members, transaction, publisher, clock, runningLimit: 30 });
  }

  function patrolOf(tokenId: string): TokenRow['patrol'] {
    return tokens.rowOf(tokenId).patrol;
  }

  describe('setPatrol', () => {
    beforeEach(() => setUp([lyraRow(), bramRow()]));

    it('Ana saving a route on the still Lyra locks, saves, bumps, commits and then publishes', async () => {
      const version = await service.setPatrol(ANA_ID, VHARN_ID, {
        tokenId: LYRA_ID,
        patrol: ROUTE,
      });

      expect(version).toBe(8);
      expect(scenes.journal).toEqual(['lock', 'savePatrol', 'bump', 'commit', 'publish']);
      expect(publisher.tokenPatrolChanges[0]).toEqual({
        campaignId: VHARN_ID,
        sceneId: VHARN_SCENE_ID,
        version: 8,
        at: '2026-11-08T12:00:02.500Z',
        changes: [
          {
            tokenId: LYRA_ID,
            patrol: { ...ROUTE, step: 0, startedAt: null },
            col: 3,
            row: 4,
            facing: 0,
          },
        ],
      });
    });

    it('a new route over a running patrol stops it where it is now and runs it again from step 0', async () => {
      setUp([walkingLyra()]);

      await service.setPatrol(ANA_ID, VHARN_ID, { tokenId: LYRA_ID, patrol: ROUTE });

      expect(scenes.journal).toEqual(['lock', 'place', 'savePatrol', 'bump', 'commit', 'publish']);
      expect(tokens.rowOf(LYRA_ID).token).toMatchObject({ col: 2, row: 0, facing: 0 });
      expect(patrolOf(LYRA_ID)).toMatchObject({ path: ROUTE.path, step: 0, startedAt: NOW });
      expect(publisher.tokenPatrolChanges[0]?.changes[0]?.patrol?.startedAt).toBe(
        '2026-11-08T12:00:02.500Z',
      );
    });

    it('patrol null takes a running route away and leaves Lyra where she is now', async () => {
      setUp([walkingLyra()]);

      await service.setPatrol(ANA_ID, VHARN_ID, { tokenId: LYRA_ID, patrol: null });

      expect(patrolOf(LYRA_ID)).toBeNull();
      expect(publisher.tokenPatrolChanges[0]?.changes).toEqual([
        { tokenId: LYRA_ID, patrol: null, col: 2, row: 0, facing: 0 },
      ]);
    });

    it('Bia, a player who controls Lyra, is FORBIDDEN before anything is locked', async () => {
      const save = service.setPatrol(BIA_ID, VHARN_ID, { tokenId: LYRA_ID, patrol: ROUTE });

      await expect(save).rejects.toMatchObject({
        code: 'FORBIDDEN',
        message: expect.stringContaining(`set a token patrol on token ${LYRA_ID}`),
      });
      expect(scenes.journal).toEqual([]);
      expect(publisher.tokenPatrolChanges).toEqual([]);
    });

    it('a point out of the 20×12 scene for the 2×2 Lyra is OUT_OF_SCENE and nothing is saved', async () => {
      setUp([lyraRow({ token: lyraPo({ width: 2, height: 2 }) })]);
      const patrol = {
        ...ROUTE,
        path: [
          [4, 4],
          [19, 0],
        ] as [number, number][],
      };

      const save = service.setPatrol(ANA_ID, VHARN_ID, { tokenId: LYRA_ID, patrol });

      await expect(save).rejects.toMatchObject({
        code: 'OUT_OF_SCENE',
        message: 'a token at (19, 0) of size 2×2 does not fit the 20×12 scene',
      });
      expect(patrolOf(LYRA_ID)).toBeNull();
      expect(publisher.tokenPatrolChanges).toEqual([]);
    });

    it('a token of another grid of the table is TOKEN_NOT_FOUND', async () => {
      setUp([rowWith(GUARD_ID, null, TORRE_ID)]);

      const save = service.setPatrol(ANA_ID, VHARN_ID, { tokenId: GUARD_ID, patrol: ROUTE });

      await expect(save).rejects.toMatchObject({ code: 'TOKEN_NOT_FOUND' });
      expect(patrolOf(GUARD_ID)).toBeNull();
    });
  });

  describe('setActiveMany', () => {
    it('starting Lyra and Bram writes now on both in one version and one event', async () => {
      setUp([walkingLyra(null), { ...bramRow(), patrol: squarePatrolPo({ tokenId: BRAM_ID }) }]);

      const version = await service.setActiveMany(ANA_ID, VHARN_ID, {
        tokenIds: [LYRA_ID, BRAM_ID],
        active: true,
      });

      expect(version).toBe(8);
      expect(scenes.journal).toEqual(['lock', 'startPatrols', 'bump', 'commit', 'publish']);
      expect([patrolOf(LYRA_ID)?.startedAt, patrolOf(BRAM_ID)?.startedAt]).toEqual([NOW, NOW]);
      const changes = publisher.tokenPatrolChanges[0]?.changes ?? [];
      expect(changes.map(({ tokenId, col, row }) => [tokenId, col, row])).toEqual([
        [LYRA_ID, 0, 0],
        [BRAM_ID, 6, 4],
      ]);
    });

    it('pausing Lyra 2.5 s into the square saves (2, 0), facing 0 and step 2', async () => {
      setUp([walkingLyra()]);

      await service.setActiveMany(ANA_ID, VHARN_ID, { tokenIds: [LYRA_ID], active: false });

      expect(scenes.journal).toEqual(['lock', 'pausePatrols', 'bump', 'commit', 'publish']);
      expect(tokens.rowOf(LYRA_ID).token).toMatchObject({ col: 2, row: 0, facing: 0 });
      expect(patrolOf(LYRA_ID)).toMatchObject({ step: 2, startedAt: null });
    });

    it.each([
      ['starting a running patrol', STARTED, true],
      ['pausing a paused patrol', null, false],
    ])('%s: the current version, no write, no bump, no event', async (_case, startedAt, active) => {
      setUp([walkingLyra(startedAt)]);

      const version = await service.setActiveMany(ANA_ID, VHARN_ID, {
        tokenIds: [LYRA_ID],
        active,
      });

      expect(version).toBe(7);
      expect(scenes.journal).toEqual(['lock', 'commit']);
      expect(publisher.tokenPatrolChanges).toEqual([]);
    });

    it('pausing on the walk back keeps the step and stands on the cell of the walk', async () => {
      const away = lyraRow({
        token: lyraPo({ col: 5, row: 5 }),
        patrol: squarePatrolPo({ step: 3, startedAt: new Date('2026-11-08T12:00:01.500Z') }),
      });
      setUp([away]);

      await service.setActiveMany(ANA_ID, VHARN_ID, { tokenIds: [LYRA_ID], active: false });

      expect(tokens.rowOf(LYRA_ID).token).toMatchObject({ col: 4, row: 4 });
      expect(patrolOf(LYRA_ID)?.step).toBe(3);
    });

    it('a patrol that does not turn keeps the facing stored', async () => {
      const still = lyraRow({
        token: lyraPo({ col: 0, row: 0, facing: 90 }),
        patrol: squarePatrolPo({ turns: false, startedAt: STARTED }),
      });
      setUp([still]);

      await service.setActiveMany(ANA_ID, VHARN_ID, { tokenIds: [LYRA_ID], active: false });

      expect(tokens.rowOf(LYRA_ID).token).toMatchObject({ col: 2, row: 0, facing: 90 });
    });

    it('starting the Ogro, who has no route, is TOKEN_PATROL_NOT_FOUND and none starts', async () => {
      setUp([walkingLyra(null), rowWith(OGRO_ID, null)]);

      const start = service.setActiveMany(ANA_ID, VHARN_ID, {
        tokenIds: [LYRA_ID, OGRO_ID],
        active: true,
      });

      await expect(start).rejects.toMatchObject({
        code: 'TOKEN_PATROL_NOT_FOUND',
        message: expect.stringContaining(OGRO_ID),
      });
      expect(patrolOf(LYRA_ID)?.startedAt).toBeNull();
    });

    it('29 running + 2 is TOKEN_PATROL_LIMIT and none starts', async () => {
      const running = Array.from({ length: 29 }, (_, index) =>
        rowWith(
          `walker-${index}`,
          squarePatrolPo({ tokenId: `walker-${index}`, startedAt: STARTED }),
        ),
      );
      const bram = { ...bramRow(), patrol: squarePatrolPo({ tokenId: BRAM_ID }) };
      setUp([...running, walkingLyra(null), bram]);

      const start = service.setActiveMany(ANA_ID, VHARN_ID, {
        tokenIds: [LYRA_ID, BRAM_ID],
        active: true,
      });

      await expect(start).rejects.toMatchObject({
        code: 'TOKEN_PATROL_LIMIT',
        message:
          'the scene would have 31 running patrols (29 running + 2 started); the limit is 30',
      });
      expect([patrolOf(LYRA_ID)?.startedAt, patrolOf(BRAM_ID)?.startedAt]).toEqual([null, null]);
    });

    it('a route that no longer fits the grown Lyra is OUT_OF_SCENE', async () => {
      const grown = lyraRow({
        token: lyraPo({ col: 0, row: 0, width: 10, height: 10 }),
        patrol: squarePatrolPo({
          path: [
            [0, 0],
            [12, 0],
          ],
          repeat: 'bounce',
        }),
      });
      setUp([grown]);

      const start = service.setActiveMany(ANA_ID, VHARN_ID, { tokenIds: [LYRA_ID], active: true });

      await expect(start).rejects.toMatchObject({
        code: 'OUT_OF_SCENE',
        message: expect.stringContaining('(12, 0) of size 10×10'),
      });
    });

    it('Bia is FORBIDDEN before anything is locked', async () => {
      setUp([walkingLyra(null)]);

      const start = service.setActiveMany(BIA_ID, VHARN_ID, { tokenIds: [LYRA_ID], active: true });

      await expect(start).rejects.toMatchObject({ code: 'FORBIDDEN' });
      expect(scenes.journal).toEqual([]);
    });
  });

  describe('hidden tokens', () => {
    function cutsOfLast(): Array<readonly [string, unknown]> {
      const cuts = publisher.veilOf('tokenPatrolsChanged') ?? [];
      return cuts.map(({ audience, event }) => {
        const changes = (event as { changes?: Array<{ tokenId: string }> } | null)?.changes;
        return [audience.kind, changes?.map(({ tokenId }) => tokenId) ?? null] as const;
      });
    }

    it('the route of the hidden Sombra goes whole to the masters and board:advanced to the rest', async () => {
      setUp([sombraRow()]);

      await service.setPatrol(ANA_ID, VHARN_ID, { tokenId: SOMBRA_ID, patrol: ROUTE });

      expect(cutsOfLast()).toEqual([
        ['masters', [SOMBRA_ID]],
        ['rest', null],
      ]);
    });

    it('starting the hidden Sombra and the visible Lyra: the rest gets only Lyra', async () => {
      const sombra = sombraRow({ patrol: squarePatrolPo({ tokenId: SOMBRA_ID }) });
      setUp([sombra, walkingLyra(null)]);

      await service.setActiveMany(ANA_ID, VHARN_ID, {
        tokenIds: [SOMBRA_ID, LYRA_ID],
        active: true,
      });

      expect(cutsOfLast()).toEqual([
        ['masters', [SOMBRA_ID, LYRA_ID]],
        ['rest', [LYRA_ID]],
      ]);
    });

    it('starting the hidden Lobo with a torch sends the rest its light with the walk', async () => {
      setUp([loboRow({ patrol: squarePatrolPo({ tokenId: LOBO_ID }) })]);

      await service.setActiveMany(ANA_ID, VHARN_ID, { tokenIds: [LOBO_ID], active: true });

      expect(scenes.journal.at(-1)).toBe('publishLights');
      const [light] = publisher.veiledLightsChanges[0]?.cuts.at(-1)?.lights ?? [];
      expect(light?.walk).toMatchObject({ col: 3, row: 4, width: 2, height: 2 });
      expect(light?.walk?.patrol.startedAt).toBe('2026-11-08T12:00:02.500Z');
    });

    // 2.5 s on its way back from (3, 4) to (0, 0) the 2×2 Lobo is on (1, 2): its center (2, 3).
    it('pausing the hidden Lobo sends the rest its light standing where it is now, without the walk', async () => {
      const walking = squarePatrolPo({ tokenId: LOBO_ID, startedAt: STARTED });
      setUp([loboRow({ patrol: walking })]);

      await service.setActiveMany(ANA_ID, VHARN_ID, { tokenIds: [LOBO_ID], active: false });

      const [light] = publisher.veiledLightsChanges[0]?.cuts.at(-1)?.lights ?? [];
      expect(light).toMatchObject({ x: 2, y: 3 });
      expect(light).not.toHaveProperty('walk');
    });
  });
});
