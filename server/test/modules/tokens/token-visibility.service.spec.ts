import { beforeEach, describe, expect, it } from 'vitest';
import { TokenVisibilityService } from '../../../src/modules/tokens/token-visibility.service';
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
import { BoardPublisherFake, ScenesDaoFake } from '../../support/scenes-fakes';
import { VHARN_SCENE_ID, scenePo } from '../../support/scenes-factories';
import { TokenTransactionRunnerFake, TokensDaoFake } from '../../support/tokens-fakes';
import {
  BRAM_ID,
  LOBO_ID,
  LYRA_ID,
  bramRow,
  loboRow,
  lyraPo,
  lyraRow,
} from '../../support/tokens-factories';

const NOW = new Date('2026-10-24T21:00:00Z');
const QUELM_TOKEN_ID = '8a7b6c5d-4e3f-4a2b-9c1d-0e9f8a7b6c5d';

describe('TokenVisibilityService', () => {
  let scenes: ScenesDaoFake;
  let tokens: TokensDaoFake;
  let publisher: BoardPublisherFake;
  let service: TokenVisibilityService;

  beforeEach(() => {
    const members = new CampaignMembersDaoFake(new CampaignsDaoFake(), {}, [
      campaignMemberPo({ campaignId: VHARN_ID, userId: ANA_ID, role: 'master' }),
      campaignMemberPo({ campaignId: VHARN_ID, userId: BIA_ID, role: 'player' }),
      campaignMemberPo({ campaignId: VHARN_ID, userId: CAIO_ID, role: 'player' }),
    ]);
    scenes = new ScenesDaoFake([
      scenePo({ version: 7 }),
      scenePo({ id: 'quelm-scene', campaignId: QUELM_ID }),
    ]);
    scenes.activeOf.set(VHARN_ID, VHARN_SCENE_ID);
    const quelmToken = lyraRow({ token: lyraPo({ id: QUELM_TOKEN_ID, sceneId: 'quelm-scene' }) });
    const visibleLobo = loboRow({ token: { ...loboRow().token, hidden: false } });
    tokens = new TokensDaoFake(scenes.journal, [lyraRow(), bramRow(), visibleLobo, quelmToken]);
    publisher = new BoardPublisherFake(scenes.journal);
    const transaction = new TokenTransactionRunnerFake(scenes, tokens);
    service = new TokenVisibilityService({
      members,
      transaction: transaction.run,
      publisher,
      clock: new ClockFake(NOW),
    });
  });

  function hiddenIds(): string[] {
    return tokens.rows.filter(({ token }) => token.hidden).map(({ token }) => token.id);
  }

  it('Ana hiding the Lobo locks, writes, reads the veil once, bumps, commits and then publishes', async () => {
    const version = await service.setHiddenMany(ANA_ID, VHARN_ID, {
      tokenIds: [LOBO_ID],
      hidden: true,
    });

    expect(version).toBe(8);
    expect(scenes.journal).toEqual([
      'lock',
      'setHidden',
      'veil',
      'bump',
      'commit',
      'publish',
      'publishLights',
    ]);
    expect(hiddenIds()).toEqual([LOBO_ID]);
    const cuts = publisher.tokensHiddenChanges[0]?.cuts ?? [];
    expect(cuts.map(({ audience, name }) => [audience.kind, name])).toEqual([
      ['masters', 'token:hiddenChanged'],
      ['controller', 'token:hiddenChanged'],
      ['rest', 'token:deletedMany'],
    ]);
  });

  it('the rest gets the torch of the Lobo it no longer sees', async () => {
    await service.setHiddenMany(ANA_ID, VHARN_ID, { tokenIds: [LOBO_ID], hidden: true });

    expect(publisher.veiledLightsChanges[0]?.cuts).toEqual([
      {
        audience: { kind: 'rest', controllerIds: [BIA_ID] },
        lights: [{ x: 4, y: 5, bright: 4, dim: 4, color: 'torch', facing: 0, angle: 360 }],
      },
    ]);
  });

  it('hiding the Lyra (no light) sends no veiled lights', async () => {
    await service.setHiddenMany(ANA_ID, VHARN_ID, { tokenIds: [LYRA_ID], hidden: true });

    expect(publisher.veiledLightsChanges).toEqual([]);
    expect(scenes.journal).not.toContain('publishLights');
  });

  it('showing the hidden Lobo again gives the rest token:createdMany with it redacted', async () => {
    await service.setHiddenMany(ANA_ID, VHARN_ID, { tokenIds: [LOBO_ID], hidden: true });

    await service.setHiddenMany(ANA_ID, VHARN_ID, { tokenIds: [LOBO_ID], hidden: false });

    const rest = publisher.tokensHiddenChanges[1]?.cuts.at(-1);
    expect(hiddenIds()).toEqual([]);
    expect(rest?.name).toBe('token:createdMany');
    if (rest?.name !== 'token:createdMany') return;
    expect(rest.event.tokens).toMatchObject([{ id: LOBO_ID, hidden: false, canControl: false }]);
  });

  it.each([
    ['Bia', BIA_ID],
    ['Caio', CAIO_ID],
  ])('%s, a player, is FORBIDDEN before anything is locked', async (_name, userId) => {
    const hide = service.setHiddenMany(userId, VHARN_ID, { tokenIds: [LOBO_ID], hidden: true });

    await expect(hide).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(scenes.journal).toEqual([]);
    expect(hiddenIds()).toEqual([]);
  });

  it('an id of another table is TOKEN_NOT_FOUND and none of the tokens hides', async () => {
    const hide = service.setHiddenMany(ANA_ID, VHARN_ID, {
      tokenIds: [LOBO_ID, QUELM_TOKEN_ID],
      hidden: true,
    });

    await expect(hide).rejects.toMatchObject({ code: 'TOKEN_NOT_FOUND' });
    expect(hiddenIds()).toEqual([]);
    expect(publisher.tokensHiddenChanges).toEqual([]);
  });

  it('every token already as asked: the current version, no write, no bump, no event', async () => {
    const version = await service.setHiddenMany(ANA_ID, VHARN_ID, {
      tokenIds: [LYRA_ID, BRAM_ID],
      hidden: false,
    });

    expect(version).toBe(7);
    expect(scenes.journal).toEqual(['lock', 'commit']);
    expect(publisher.tokensHiddenChanges).toEqual([]);
  });

  it('only the tokens that change are written', async () => {
    await service.setHiddenMany(ANA_ID, VHARN_ID, { tokenIds: [LOBO_ID], hidden: true });

    await service.setHiddenMany(ANA_ID, VHARN_ID, { tokenIds: [LOBO_ID, BRAM_ID], hidden: true });

    const flags = publisher.tokensHiddenChanges[1]?.cuts[0];
    expect(flags?.name === 'token:hiddenChanged' && flags.event.tokenIds).toEqual([BRAM_ID]);
  });

  it('a grid of another table is SCENE_NOT_FOUND for Ana', async () => {
    const hide = service.setHiddenMany(ANA_ID, VHARN_ID, {
      sceneId: 'quelm-scene',
      tokenIds: [QUELM_TOKEN_ID],
      hidden: true,
    });

    await expect(hide).rejects.toMatchObject({ code: 'SCENE_NOT_FOUND' });
  });
});
