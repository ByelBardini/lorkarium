import { CharacterPublisherFake } from '../../support/characters-fakes';
import { beforeEach, describe, expect, it } from 'vitest';
import { changeSceneOf, combatVeilOf, veiledWriteOf } from '../../../src/modules/tokens/token-veil';
import { TokensService } from '../../../src/modules/tokens/tokens.service';
import type { TokenWriteDaos } from '../../../src/modules/tokens/token-transaction';
import { ClockFake } from '../../support/auth-fakes';
import { ANA_ID } from '../../support/auth-factories';
import { CampaignMembersDaoFake, CampaignsDaoFake } from '../../support/campaigns-fakes';
import { BIA_ID, CAIO_ID, VHARN_ID, campaignMemberPo } from '../../support/campaigns-factories';
import { CombatDaoFake, soloEntries } from '../../support/combat-fakes';
import { BoardPublisherFake, ScenesDaoFake } from '../../support/scenes-fakes';
import { VHARN_SCENE_ID, scenePo } from '../../support/scenes-factories';
import {
  DragGroupsFake,
  TableTokenRightsFake,
  TokenTransactionRunnerFake,
  TokensDaoFake,
} from '../../support/tokens-fakes';
import {
  LOBO_ID,
  LYRA_ID,
  SOMBRA_ID,
  loboRow,
  lyraRow,
  sombraRow,
} from '../../support/tokens-factories';
import { SceneWallsFake } from '../../support/walls-fakes';

describe('the veil of a write (token-veil.ts)', () => {
  let journal: string[];
  let tokens: TokensDaoFake;
  let daos: Pick<TokenWriteDaos, 'tokens'>;

  beforeEach(() => {
    journal = [];
    tokens = new TokensDaoFake(journal, [lyraRow(), loboRow(), sombraRow()]);
    daos = { tokens };
  });

  it('a write of visible tokens reads nothing and has no veil', async () => {
    const veiled = await veiledWriteOf(daos, VHARN_SCENE_ID, [lyraRow()]);

    expect(veiled).toEqual({ veil: { tokens: [] }, lights: null });
    expect(journal).toEqual([]);
  });

  it('a write of the hidden Sombra (no light) veils it without reading the scene', async () => {
    const veiled = await veiledWriteOf(daos, VHARN_SCENE_ID, [sombraRow()]);

    expect(veiled.veil.tokens.map(({ tokenId }) => tokenId)).toEqual([SOMBRA_ID]);
    expect(veiled.lights).toBeNull();
    expect(journal).toEqual([]);
  });

  it('a write of the lit Lobo reads the scene once and gives the rest its torch', async () => {
    const veiled = await veiledWriteOf(daos, VHARN_SCENE_ID, [loboRow()]);

    expect(journal).toEqual(['veil']);
    expect(veiled.lights).toEqual([
      {
        audience: { kind: 'rest', controllerIds: [BIA_ID] },
        lights: [{ x: 4, y: 5, bright: 4, dim: 4, color: 'torch', facing: 0, angle: 360 }],
      },
    ]);
  });

  it('an event with a combat that has tokens joins every hidden token of the scene', async () => {
    const combat = { id: 'c', round: 1, currentCombatantId: null, combatants: [] };
    const withTokens = {
      ...combat,
      combatants: [{ id: 'e', name: null, tokenIds: [LYRA_ID], initiative: null, tieOrder: 0 }],
    };

    const without = await combatVeilOf(daos, VHARN_SCENE_ID, [lyraRow()], combat);
    const joined = await combatVeilOf(daos, VHARN_SCENE_ID, [lyraRow()], withTokens);

    expect(without.tokens).toEqual([]);
    expect(joined.tokens.map(({ tokenId }) => tokenId)).toEqual([LOBO_ID, SOMBRA_ID]);
    expect(journal).toEqual(['veil']);
  });
});

describe('the scene of a change of one token', () => {
  it('Bia losing the control of the hidden Lobo reads the scene veil and the combat', async () => {
    const scenes = new ScenesDaoFake([scenePo()]);
    const tokens = new TokensDaoFake(scenes.journal, [loboRow({ controllerIds: [CAIO_ID] })]);
    const combat = new CombatDaoFake(scenes.journal);
    await combat.start(VHARN_SCENE_ID, soloEntries(LOBO_ID));
    const runner = new TokenTransactionRunnerFake(scenes, tokens, undefined, combat);
    const scene = scenePo();

    const changed = await runner.run((daos) =>
      changeSceneOf(daos, scene, loboRow(), loboRow({ controllerIds: [CAIO_ID] }), false),
    );

    expect(changed.formerControllerIds).toEqual([BIA_ID]);
    expect(changed.veil.tokens.map(({ tokenId }) => tokenId)).toEqual([LOBO_ID]);
    expect(changed.combat?.combatants).toHaveLength(1);
  });

  it('a hidden token keeping its controllers reads nothing more', async () => {
    const scenes = new ScenesDaoFake([scenePo()]);
    const tokens = new TokensDaoFake(scenes.journal, [loboRow()]);
    const runner = new TokenTransactionRunnerFake(scenes, tokens);

    const changed = await runner.run((daos) =>
      changeSceneOf(daos, scenePo(), loboRow(), loboRow(), false),
    );

    expect(changed).toMatchObject({
      hidden: true,
      combat: null,
      lights: null,
      veil: { tokens: [] },
    });
    expect(scenes.journal).toEqual(['commit']);
  });
});

describe('the diary of a move under the veil', () => {
  let scenes: ScenesDaoFake;
  let publisher: BoardPublisherFake;
  let service: TokensService;

  beforeEach(() => {
    const members = new CampaignMembersDaoFake(new CampaignsDaoFake(), {}, [
      campaignMemberPo({ campaignId: VHARN_ID, userId: ANA_ID, role: 'master' }),
    ]);
    scenes = new ScenesDaoFake([scenePo({ version: 7 })]);
    scenes.activeOf.set(VHARN_ID, VHARN_SCENE_ID);
    const tokens = new TokensDaoFake(scenes.journal, [lyraRow(), loboRow()]);
    publisher = new BoardPublisherFake(scenes.journal);
    service = new TokensService({
      members,
      transaction: new TokenTransactionRunnerFake(scenes, tokens).run,
      dragGroups: new DragGroupsFake(scenes, tokens),
      sceneWalls: new SceneWallsFake(),
      publisher,
      characterPublisher: new CharacterPublisherFake(),
      clock: new ClockFake(new Date('2026-10-24T21:00:00Z')),
      barLimit: 999,
      tokenLimit: 500,
      tokenRights: new TableTokenRightsFake(),
    });
  });

  it('moving the visible Lyra keeps the diary of always and publishes without a veil', async () => {
    await service.moveMany(ANA_ID, VHARN_ID, { moves: [{ tokenId: LYRA_ID, col: 1, row: 1 }] });

    expect(scenes.journal).toEqual(['lock', 'save', 'bump', 'commit', 'publish']);
    expect(publisher.veils).toEqual([]);
  });

  it('moving the lit hidden Lobo reads the veil before the bump and publishes cut, then the lights', async () => {
    await service.moveMany(ANA_ID, VHARN_ID, { moves: [{ tokenId: LOBO_ID, col: 1, row: 1 }] });

    expect(scenes.journal).toEqual([
      'lock',
      'save',
      'veil',
      'bump',
      'commit',
      'publish',
      'publishLights',
    ]);
    const cuts = publisher.veilOf('tokensMoved') ?? [];
    expect(cuts.map(({ audience, event }) => [audience.kind, event === null])).toEqual([
      ['masters', false],
      ['controller', false],
      ['rest', true],
    ]);
  });
});
