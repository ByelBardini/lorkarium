import { beforeEach, describe, expect, it } from 'vitest';
import { MainTokenService } from '../../../src/modules/tokens/main-token.service';
import { TokenAppearanceService } from '../../../src/modules/tokens/token-appearance.service';
import { TokenBatchService } from '../../../src/modules/tokens/token-batch.service';
import { TokensService, type CreateToken } from '../../../src/modules/tokens/tokens.service';
import { AssetsDaoFake } from '../../support/assets-fakes';
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
import { CombatDaoFake } from '../../support/combat-fakes';
import { ConditionsDaoFake } from '../../support/conditions-fakes';
import { TORRE_ID, torrePo } from '../../support/library-factories';
import { BoardPublisherFake, ScenesDaoFake } from '../../support/scenes-fakes';
import { VHARN_SCENE_ID, scenePo } from '../../support/scenes-factories';
import {
  DragGroupsFake,
  MainTokensDaoFake,
  TokenTransactionRunnerFake,
  TokensDaoFake,
} from '../../support/tokens-fakes';
import { LYRA_ID, lyraPo, lyraRow, pvBar } from '../../support/tokens-factories';
import { SceneWallsFake, WallsDaoFake } from '../../support/walls-fakes';

const NOW = new Date('2026-10-22T21:00:00Z');
const TORRE_LYRA_ID = '9b8a7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
const TORRE_PV_ID = '0a9b8c7d-6e5f-4a4b-9c3d-2e1f0a9b8c7d';
const GOBLIN: CreateToken = {
  name: 'Goblin',
  initials: 'GO',
  side: 'enemy',
  width: 1,
  height: 1,
  col: 2,
  row: 2,
  layer: 'tokens',
  controllerIds: [],
  imageAssetId: null,
  frame: 'square',
  flipX: false,
  flipY: false,
  facing: 0,
  sightAngle: 360,
  bars: [],
};

describe('token commands on a grid that is not the group one', () => {
  let scenes: ScenesDaoFake;
  let publisher: BoardPublisherFake;
  let dragGroups: DragGroupsFake;
  let tokens: TokensService;
  let batch: TokenBatchService;
  let appearance: TokenAppearanceService;
  let mainToken: MainTokenService;

  beforeEach(() => {
    const members = new CampaignMembersDaoFake(new CampaignsDaoFake(), {}, [
      campaignMemberPo({ campaignId: VHARN_ID, userId: ANA_ID, role: 'master' }),
      campaignMemberPo({ campaignId: VHARN_ID, userId: BIA_ID, role: 'player' }),
      campaignMemberPo({ campaignId: VHARN_ID, userId: CAIO_ID, role: 'player' }),
      campaignMemberPo({ campaignId: QUELM_ID, userId: CAIO_ID, role: 'master' }),
    ]);
    scenes = new ScenesDaoFake([
      scenePo({ version: 4 }),
      torrePo(),
      scenePo({ id: 'quelm-scene', campaignId: QUELM_ID }),
    ]);
    scenes.activeOf.set(VHARN_ID, VHARN_SCENE_ID);
    scenes.activeOf.set(QUELM_ID, 'quelm-scene');
    const torreLyra = lyraRow({
      token: lyraPo({ id: TORRE_LYRA_ID, sceneId: TORRE_ID }),
      bars: [pvBar({ id: TORRE_PV_ID, tokenId: TORRE_LYRA_ID })],
    });
    const tokenRows = new TokensDaoFake(scenes.journal, [lyraRow(), torreLyra]);
    publisher = new BoardPublisherFake(scenes.journal);
    const runner = new TokenTransactionRunnerFake(
      scenes,
      tokenRows,
      new ConditionsDaoFake(),
      new CombatDaoFake(),
      new AssetsDaoFake(),
      new WallsDaoFake(scenes.journal),
      new MainTokensDaoFake(scenes.journal),
    );
    dragGroups = new DragGroupsFake(scenes, tokenRows);
    const common = { members, transaction: runner.run, publisher, clock: new ClockFake(NOW) };
    const limits = { barLimit: 99_999, tokenLimit: 500 };
    tokens = new TokensService({
      ...common,
      ...limits,
      dragGroups,
      sceneWalls: new SceneWallsFake(),
    });
    batch = new TokenBatchService({ ...common, ...limits });
    appearance = new TokenAppearanceService(common);
    mainToken = new MainTokenService(common);
  });

  function versionOf(sceneId: string): number | undefined {
    return scenes.rows.find(({ id }) => id === sceneId)?.version;
  }

  it('Ana creating a goblin in the Torre locks the Torre, saves it there and publishes with its sceneId', async () => {
    const version = await tokens.create(ANA_ID, VHARN_ID, { ...GOBLIN, sceneId: TORRE_ID });

    expect(version).toBe(8);
    expect(scenes.journal).toEqual([
      `lockInCampaign:${TORRE_ID}`,
      'save',
      'bump',
      'commit',
      'publish',
    ]);
    const [change] = publisher.tokenChanges;
    expect(change).toMatchObject({ sceneId: TORRE_ID, privileged: { sceneId: TORRE_ID } });
    expect(change?.others).toMatchObject({ sceneId: TORRE_ID, version: 8 });
    expect(versionOf(VHARN_SCENE_ID)).toBe(4);
  });

  it('Bia moving her Lyra in the private Torre is SCENE_NOT_FOUND before anything is saved', async () => {
    const move = tokens.move(BIA_ID, VHARN_ID, {
      sceneId: TORRE_ID,
      tokenId: TORRE_LYRA_ID,
      col: 5,
      row: 5,
    });

    await expect(move).rejects.toMatchObject({ code: 'SCENE_NOT_FOUND' });
    expect(scenes.journal).toEqual([`lockInCampaign:${TORRE_ID}`]);
    expect(publisher.published).toBe(0);
  });

  it('once the Torre is public, Bia moves her Lyra there: token:moved has the Torre and the group grid keeps its version', async () => {
    scenes.setVisibility(TORRE_ID, 'public');

    const command = { sceneId: TORRE_ID, tokenId: TORRE_LYRA_ID, col: 5, row: 5 };
    const version = await tokens.move(BIA_ID, VHARN_ID, command);

    expect(version).toBe(8);
    expect(publisher.tokenMoves).toEqual([
      {
        campaignId: VHARN_ID,
        sceneId: TORRE_ID,
        version: 8,
        at: NOW.toISOString(),
        tokenId: TORRE_LYRA_ID,
        col: 5,
        row: 5,
      },
    ]);
    expect(versionOf(VHARN_SCENE_ID)).toBe(4);
  });

  it('a token of the group grid addressed to the Torre is TOKEN_NOT_FOUND', async () => {
    const move = tokens.move(ANA_ID, VHARN_ID, {
      sceneId: TORRE_ID,
      tokenId: LYRA_ID,
      col: 1,
      row: 1,
    });

    await expect(move).rejects.toMatchObject({ code: 'TOKEN_NOT_FOUND' });
  });

  it("a sceneId of Quelm's grid at Vharn is SCENE_NOT_FOUND, even for the master", async () => {
    const create = tokens.create(ANA_ID, VHARN_ID, { ...GOBLIN, sceneId: 'quelm-scene' });

    await expect(create).rejects.toMatchObject({ code: 'SCENE_NOT_FOUND' });
    expect(publisher.published).toBe(0);
  });

  it('without sceneId a token:moved carries the group grid', async () => {
    await tokens.move(BIA_ID, VHARN_ID, { tokenId: LYRA_ID, col: 8, row: 6 });

    expect(scenes.journal[0]).toBe('lock');
    expect(publisher.tokenMoves[0]).toMatchObject({ sceneId: VHARN_SCENE_ID, version: 5 });
  });

  it('Bia adjusting the PV of her Lyra in the public Torre publishes token:updated with the Torre', async () => {
    scenes.setVisibility(TORRE_ID, 'public');

    const command = { sceneId: TORRE_ID, tokenId: TORRE_LYRA_ID, barId: TORRE_PV_ID };
    await tokens.adjustBar(BIA_ID, VHARN_ID, { ...command, change: { op: 'add', amount: -3 } });

    expect(publisher.tokenChanges[0]).toMatchObject({
      name: 'token:updated',
      sceneId: TORRE_ID,
      controllerIds: [BIA_ID],
    });
  });

  it('the drag preview in the Torre reads that grid and goes out with its sceneId', async () => {
    const drags = [{ tokenId: TORRE_LYRA_ID, cell: { col: 4, row: 4 } }];

    const version = await tokens.dragMany(ANA_ID, VHARN_ID, { sceneId: TORRE_ID, drags }, 'sock-1');

    expect(version).toBe(7);
    expect(dragGroups.asked).toEqual([`${VHARN_ID}:${TORRE_ID}`]);
    expect(publisher.tokensDrags[0]?.event).toMatchObject({ sceneId: TORRE_ID, drags });
  });

  it('Bia dragging in the private Torre is SCENE_NOT_FOUND and nothing is published', async () => {
    const drags = [{ tokenId: TORRE_LYRA_ID, cell: { col: 4, row: 4 } }];

    const drag = tokens.dragMany(BIA_ID, VHARN_ID, { sceneId: TORRE_ID, drags }, 'sock-1');

    await expect(drag).rejects.toMatchObject({ code: 'SCENE_NOT_FOUND' });
    expect(publisher.tokensDrags).toEqual([]);
  });

  it('a paste in the Torre locks the Torre and token:createdMany carries it', async () => {
    const created = await batch.createMany(ANA_ID, VHARN_ID, {
      sceneId: TORRE_ID,
      tokens: [{ ...GOBLIN, hidden: false }],
    });

    expect(created.version).toBe(8);
    expect(scenes.journal[0]).toBe(`lockInCampaign:${TORRE_ID}`);
    expect(publisher.tokensCreations[0]).toMatchObject({ sceneId: TORRE_ID, version: 8 });
  });

  it('deleting the Lyra of the Torre in a batch publishes token:deletedMany with the Torre', async () => {
    await batch.deleteMany(ANA_ID, VHARN_ID, { sceneId: TORRE_ID, tokenIds: [TORRE_LYRA_ID] });

    expect(publisher.tokensDeletes[0]).toMatchObject({ sceneId: TORRE_ID, version: 8 });
  });

  it('Bia turning her Lyra in the private Torre is SCENE_NOT_FOUND before anything is saved', async () => {
    const faces = [{ tokenId: TORRE_LYRA_ID, facing: 90 }];

    const face = appearance.faceMany(BIA_ID, VHARN_ID, { sceneId: TORRE_ID, faces });

    await expect(face).rejects.toMatchObject({ code: 'SCENE_NOT_FOUND' });
    expect(scenes.journal).toEqual([`lockInCampaign:${TORRE_ID}`]);
  });

  it('turning, restyling and resizing in the Torre each publish with the Torre', async () => {
    const faces = [{ tokenId: TORRE_LYRA_ID, facing: 90 }];
    const resizes = [{ tokenId: TORRE_LYRA_ID, col: 3, row: 4, width: 2, height: 2 }];
    const style = { frame: 'round' } as const;
    const tokenIds = [TORRE_LYRA_ID];

    await appearance.faceMany(ANA_ID, VHARN_ID, { sceneId: TORRE_ID, faces });
    await appearance.restyleMany(ANA_ID, VHARN_ID, { sceneId: TORRE_ID, tokenIds, style });
    await appearance.resizeMany(ANA_ID, VHARN_ID, { sceneId: TORRE_ID, resizes });

    const published = [
      publisher.tokensFacings[0],
      publisher.tokensRestylings[0],
      publisher.tokensResizes[0],
    ];
    expect(published.map((event) => event?.sceneId)).toEqual([TORRE_ID, TORRE_ID, TORRE_ID]);
    expect(published.map((event) => event?.version)).toEqual([8, 9, 10]);
  });

  it('Bia choosing her Lyra of the public Torre as main locks the Torre and token:mainChanged carries it', async () => {
    scenes.setVisibility(TORRE_ID, 'public');

    await mainToken.choose(BIA_ID, VHARN_ID, { sceneId: TORRE_ID, tokenId: TORRE_LYRA_ID });

    expect(scenes.journal).toEqual([
      `lockInCampaign:${TORRE_ID}`,
      'choose',
      'bump',
      'commit',
      'publish',
    ]);
    expect(publisher.mainTokenChanges[0]).toMatchObject({ sceneId: TORRE_ID, version: 8 });
  });
});
