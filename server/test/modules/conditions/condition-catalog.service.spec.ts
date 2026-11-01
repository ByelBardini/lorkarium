import { beforeEach, describe, expect, it } from 'vitest';
import {
  ConditionCatalogService,
  type UpdateConditionDefinition,
} from '../../../src/modules/conditions/condition-catalog.service';
import { ClockFake } from '../../support/auth-fakes';
import { ANA_ID } from '../../support/auth-factories';
import { CampaignMembersDaoFake, CampaignsDaoFake } from '../../support/campaigns-fakes';
import {
  BIA_ID,
  DUDA_ID,
  QUELM_ID,
  VHARN_ID,
  campaignMemberPo,
} from '../../support/campaigns-factories';
import { AssetsDaoFake } from '../../support/assets-fakes';
import { QUELM_MAP_ID, lyraPortraitPo } from '../../support/assets-factories';
import { CombatDaoFake } from '../../support/combat-fakes';
import { ConditionTransactionRunnerFake, ConditionsDaoFake } from '../../support/conditions-fakes';
import { BoardPublisherFake, ScenesDaoFake } from '../../support/scenes-fakes';
import { VHARN_CAST_ID, VHARN_SCENE_ID, castPo, scenePo } from '../../support/scenes-factories';
import { TokensDaoFake } from '../../support/tokens-fakes';
import { BRAM_ID, LYRA_ID, bramRow, lyraRow } from '../../support/tokens-factories';
import { DEFAULT_CONDITIONS } from '../../../src/modules/conditions/condition-rules.bo';
import type { ConditionDefinitionUpdatedDto } from '@lorkarium/contracts';
import type { ConditionCatalogServiceDeps } from '../../../src/modules/conditions/condition-catalog.service';

const NOW = new Date('2026-10-24T21:00:00Z');
const SANGRANDO_OF_QUELM = `${QUELM_ID}-Sangrando`;
const VENENO_ART_ID = '7d6c5b4a-3e2f-4a1b-8c9d-0e1f2a3b4c5d';

describe('ConditionCatalogService', () => {
  let scenes: ScenesDaoFake;
  let conditions: ConditionsDaoFake;
  let assets: AssetsDaoFake;
  let publisher: BoardPublisherFake;
  let service: ConditionCatalogService;
  let deps: ConditionCatalogServiceDeps;
  let envenenado: string;
  let cego: string;

  beforeEach(() => {
    const campaigns = new CampaignsDaoFake();
    const members = new CampaignMembersDaoFake(campaigns, {}, [
      campaignMemberPo({ campaignId: VHARN_ID, userId: ANA_ID, role: 'master' }),
      campaignMemberPo({ campaignId: VHARN_ID, userId: BIA_ID, role: 'player' }),
      campaignMemberPo({ campaignId: VHARN_ID, userId: DUDA_ID, role: 'spectator' }),
    ]);
    scenes = new ScenesDaoFake([scenePo({ version: 4 }), castPo({ version: 2 })]);
    scenes.activeOf.set(VHARN_ID, VHARN_SCENE_ID);
    const tokens = new TokensDaoFake(scenes.journal, [lyraRow(), bramRow()]);
    conditions = new ConditionsDaoFake(scenes.journal);
    envenenado = conditions.define(VHARN_ID, 'Envenenado', 'harm', 'flask-conical');
    cego = conditions.define(VHARN_ID, 'Cego', 'harm', 'eye-off');
    conditions.define(QUELM_ID, 'Sangrando', 'harm');
    publisher = new BoardPublisherFake(scenes.journal);
    assets = new AssetsDaoFake(
      [],
      [
        lyraPortraitPo({ id: VENENO_ART_ID, purpose: 'condition', width: 256, height: 256 }),
        lyraPortraitPo({ id: QUELM_MAP_ID, campaignId: QUELM_ID, purpose: 'condition' }),
      ],
    );
    const combat = new CombatDaoFake();
    const transaction = new ConditionTransactionRunnerFake(
      scenes,
      tokens,
      conditions,
      combat,
      assets,
    );
    deps = {
      members,
      transaction: transaction.run,
      reader: conditions,
      publisher,
      clock: new ClockFake(NOW),
    };
    service = new ConditionCatalogService(deps);
  });

  function envenenadoEdit(
    overrides: Partial<UpdateConditionDefinition> = {},
  ): UpdateConditionDefinition {
    return envenenadoEditOf(envenenado, overrides);
  }

  async function heldByLyraAndBram(conditionId: string): Promise<void> {
    await conditions.apply({ tokenId: LYRA_ID }, conditionId, {
      remainingRounds: null,
      appliedRound: null,
    });
    await conditions.apply({ tokenId: BRAM_ID }, conditionId, {
      remainingRounds: 2,
      appliedRound: null,
    });
    scenes.journal.splice(0);
  }

  function vharnDefinitionNames(): string[] {
    return conditions.definitions.filter((d) => d.campaignId === VHARN_ID).map((d) => d.name);
  }

  describe('update', () => {
    it('the master describing Envenenado saves it, bumps the cast and publishes the new definition after the commit', async () => {
      const version = await service.update(ANA_ID, VHARN_ID, envenenadoEdit());

      expect(version).toBe(3);
      expect(scenes.journal).toEqual(['lock cast', 'save', 'bump cast', 'commit', 'publish']);
      expect(publisher.catalogEvents).toEqual([
        {
          name: 'condition:definitionUpdated',
          event: {
            campaignId: VHARN_ID,
            sceneId: VHARN_CAST_ID,
            version: 3,
            at: NOW.toISOString(),
            definition: {
              id: envenenado,
              name: 'Envenenado',
              tone: 'harm',
              icon: 'flask-conical',
              look: null,
              description: 'Desvantagem em ataques.',
              maxStacks: null,
              imageAssetId: null,
              color: null,
            },
          },
        },
      ]);
    });

    it('the tokens holding it read the new description', async () => {
      await heldByLyraAndBram(envenenado);

      await service.update(ANA_ID, VHARN_ID, envenenadoEdit());

      expect(conditions.active.map(({ description }) => description)).toEqual([
        'Desvantagem em ataques.',
        'Desvantagem em ataques.',
      ]);
    });

    it('only changing the case of its own name ("envenenado") is allowed', async () => {
      await service.update(ANA_ID, VHARN_ID, envenenadoEdit({ name: 'envenenado' }));

      expect(vharnDefinitionNames()).toEqual(['envenenado', 'Cego']);
    });

    it('saving with no real change still bumps the version (the actionId makes it idempotent)', async () => {
      const edit = { ...envenenadoEdit(), description: '' };

      const version = await service.update(ANA_ID, VHARN_ID, edit);

      expect(version).toBe(3);
      expect(publisher.catalogEvents).toHaveLength(1);
    });

    it('renaming into "cego" (another condition, any case) is CONDITION_NAME_TAKEN and nothing is saved', async () => {
      await expect(
        service.update(ANA_ID, VHARN_ID, envenenadoEdit({ name: 'cego' })),
      ).rejects.toMatchObject({ code: 'CONDITION_NAME_TAKEN', conditionName: 'Cego' });
      expect(scenes.journal).not.toContain('save');
      expect(vharnDefinitionNames()).toEqual(['Envenenado', 'Cego']);
      expect(publisher.published).toBe(0);
    });

    it('the id of a condition of another table is CONDITION_NOT_FOUND and that one stays untouched', async () => {
      await expect(
        service.update(ANA_ID, VHARN_ID, envenenadoEdit({ conditionId: SANGRANDO_OF_QUELM })),
      ).rejects.toMatchObject({ code: 'CONDITION_NOT_FOUND' });
      expect(conditions.definitions.find(({ id }) => id === SANGRANDO_OF_QUELM)?.name).toBe(
        'Sangrando',
      );
      expect(publisher.published).toBe(0);
    });
  });

  describe('update of the image', () => {
    it('an image of the table is saved and goes out in condition:definitionUpdated', async () => {
      const version = await service.update(
        ANA_ID,
        VHARN_ID,
        envenenadoEdit({ imageAssetId: VENENO_ART_ID }),
      );

      expect(version).toBe(3);
      expect(scenes.journal).toEqual(['lock cast', 'save', 'bump cast', 'commit', 'publish']);
      expect(conditions.definitions.find(({ id }) => id === envenenado)?.imageAssetId).toBe(
        VENENO_ART_ID,
      );
      expect(publisher.catalogEvents).toEqual([
        expect.objectContaining({
          event: expect.objectContaining({
            definition: expect.objectContaining({ id: envenenado, imageAssetId: VENENO_ART_ID }),
          }),
        }),
      ]);
    });

    it('no image (null) does not look up the assets', async () => {
      await service.update(ANA_ID, VHARN_ID, envenenadoEdit({ imageAssetId: null }));

      expect(assets.lookups).toEqual([]);
    });

    it('an image of another table is ASSET_NOT_FOUND citing it: nothing saved nor published', async () => {
      const update = service.update(
        ANA_ID,
        VHARN_ID,
        envenenadoEdit({ imageAssetId: QUELM_MAP_ID }),
      );

      await expect(update).rejects.toMatchObject({
        code: 'ASSET_NOT_FOUND',
        message: expect.stringContaining(QUELM_MAP_ID),
      });
      expect(scenes.journal).toEqual(['lock cast']);
      expect(conditions.definitions.find(({ id }) => id === envenenado)).toMatchObject({
        imageAssetId: null,
        description: '',
      });
      expect(publisher.published).toBe(0);
    });

    it('a player giving an image is FORBIDDEN before anything is locked or looked up', async () => {
      const update = service.update(
        BIA_ID,
        VHARN_ID,
        envenenadoEdit({ imageAssetId: VENENO_ART_ID }),
      );

      await expect(update).rejects.toMatchObject({ code: 'FORBIDDEN' });
      expect(scenes.journal).toEqual([]);
      expect(assets.lookups).toEqual([]);
    });
  });

  describe('update of the stacks cap', () => {
    let sangrando: string;
    let stacksSeen: StacksAtPublishPublisherFake;

    beforeEach(async () => {
      sangrando = conditions.define(VHARN_ID, 'Sangrando', 'harm', 'droplet', null, '', 5);
      const duration = { remainingRounds: null, appliedRound: null };
      await conditions.apply({ tokenId: LYRA_ID }, sangrando, duration, 4);
      await conditions.apply({ tokenId: BRAM_ID }, sangrando, duration, 1);
      stacksSeen = new StacksAtPublishPublisherFake(conditions, scenes.journal);
      service = new ConditionCatalogService({ ...deps, publisher: stacksSeen });
    });

    function sangrandoEdit(maxStacks: number | null): UpdateConditionDefinition {
      return {
        conditionId: sangrando,
        name: 'Sangrando',
        tone: 'harm',
        icon: 'droplet',
        look: null,
        description: '',
        maxStacks,
        imageAssetId: null,
        color: null,
      };
    }

    it('lowering the max from 5 to 2 caps the Lyra holding 4 at 2 before publishing, Bram keeps 1', async () => {
      await service.update(ANA_ID, VHARN_ID, sangrandoEdit(2));

      expect(stacksSeen.stacksAtPublish).toEqual([[2, 1]]);
      expect(conditions.active.map(({ stacks, maxStacks }) => [stacks, maxStacks])).toEqual([
        [2, 2],
        [1, 2],
      ]);
    });

    it('taking the max away (null) brings every holder back to 1 stack', async () => {
      await service.update(ANA_ID, VHARN_ID, sangrandoEdit(null));

      expect(stacksSeen.stacksAtPublish).toEqual([[1, 1]]);
    });

    it('raising the max from 5 to 9 keeps the 4 stacks of the Lyra', async () => {
      await service.update(ANA_ID, VHARN_ID, sangrandoEdit(9));

      expect(conditions.active.map(({ stacks }) => stacks)).toEqual([4, 1]);
    });
  });

  describe('delete', () => {
    it('the master deleting Cego removes it from the list and from the tokens, then publishes its id', async () => {
      await heldByLyraAndBram(cego);

      const version = await service.delete(ANA_ID, VHARN_ID, { conditionId: cego });

      expect(version).toBe(3);
      expect(scenes.journal).toEqual(['lock cast', 'save', 'bump cast', 'commit', 'publish']);
      expect(vharnDefinitionNames()).toEqual(['Envenenado']);
      expect(conditions.active).toEqual([]);
      expect(publisher.catalogEvents).toEqual([
        {
          name: 'condition:definitionDeleted',
          event: {
            campaignId: VHARN_ID,
            sceneId: VHARN_CAST_ID,
            version: 3,
            at: NOW.toISOString(),
            conditionId: cego,
          },
        },
      ]);
    });

    it('the id of a condition of another table is CONDITION_NOT_FOUND and that one is kept', async () => {
      await expect(
        service.delete(ANA_ID, VHARN_ID, { conditionId: SANGRANDO_OF_QUELM }),
      ).rejects.toMatchObject({ code: 'CONDITION_NOT_FOUND' });
      expect(conditions.definitions.map(({ id }) => id)).toContain(SANGRANDO_OF_QUELM);
      expect(publisher.published).toBe(0);
    });
  });

  describe('usage', () => {
    it('Cego on Lyra and Bram counts 2 tokens, with no lock, no bump and no event', async () => {
      await heldByLyraAndBram(cego);

      const tokens = await service.usage(ANA_ID, VHARN_ID, { conditionId: cego });

      expect(tokens).toBe(2);
      expect(scenes.journal).toEqual([]);
      expect(scenes.rows.map(({ version }) => version)).toEqual([4, 2]);
      expect(publisher.published).toBe(0);
    });

    it('a condition nobody holds counts 0', async () => {
      expect(await service.usage(ANA_ID, VHARN_ID, { conditionId: envenenado })).toBe(0);
    });

    it('the id of a condition of another table is CONDITION_NOT_FOUND', async () => {
      await expect(
        service.usage(ANA_ID, VHARN_ID, { conditionId: SANGRANDO_OF_QUELM }),
      ).rejects.toMatchObject({ code: 'CONDITION_NOT_FOUND' });
    });
  });

  describe('restoreDefaults', () => {
    it('brings back only the 9 missing defaults, publishes them and keeps the edited ones', async () => {
      await service.update(ANA_ID, VHARN_ID, envenenadoEdit());
      scenes.journal.splice(0);
      publisher.catalogEvents.splice(0);

      const version = await service.restoreDefaults(ANA_ID, VHARN_ID);

      expect(version).toBe(4);
      expect(scenes.journal).toEqual(['lock cast', 'save', 'bump cast', 'commit', 'publish']);
      const [published] = publisher.catalogEvents;
      expect(published?.name).toBe('condition:defaultsRestored');
      const restored = published?.event as { definitions: { name: string }[]; version: number };
      expect(restored.version).toBe(4);
      expect(restored.definitions.map(({ name }) => name)).toEqual([
        'Abençoado',
        'Concentrando',
        'Invisível',
        'Agarrado',
        'Amedrontado',
        'Atordoado',
        'Caído',
        'Imobilizado',
        'Paralisado',
      ]);
      const kept = conditions.definitions.find(({ id }) => id === envenenado);
      expect(kept?.description).toBe('Desvantagem em ataques.');
    });

    it('with nothing missing answers the current version: no save, no bump, no event', async () => {
      const missing = DEFAULT_CONDITIONS.filter(
        ({ name }) => !['Envenenado', 'Cego'].includes(name),
      );
      await conditions.insertDefinitions(VHARN_ID, missing);
      scenes.journal.splice(0);

      const version = await service.restoreDefaults(ANA_ID, VHARN_ID);

      expect(version).toBe(2);
      expect(scenes.journal).toEqual(['lock cast', 'commit']);
      expect(publisher.published).toBe(0);
    });
  });

  describe('who may change the list', () => {
    type CatalogCall = (s: ConditionCatalogService, user: string, id: string) => Promise<number>;
    const refusals: ReadonlyArray<readonly [string, CatalogCall]> = [
      [
        'update',
        (s: ConditionCatalogService, user: string, id: string) =>
          s.update(user, VHARN_ID, envenenadoEditOf(id)),
      ],
      [
        'delete',
        (s: ConditionCatalogService, user: string, id: string) =>
          s.delete(user, VHARN_ID, { conditionId: id }),
      ],
      [
        'usage',
        (s: ConditionCatalogService, user: string, id: string) =>
          s.usage(user, VHARN_ID, { conditionId: id }),
      ],
      [
        'restoreDefaults',
        (s: ConditionCatalogService, user: string) => s.restoreDefaults(user, VHARN_ID),
      ],
    ];

    it.each(refusals)(
      'a player calling %s is FORBIDDEN before anything is locked',
      async (_, call) => {
        await expect(call(service, BIA_ID, envenenado)).rejects.toMatchObject({
          code: 'FORBIDDEN',
        });
        expect(scenes.journal).toEqual([]);
        expect(publisher.published).toBe(0);
      },
    );

    it.each(refusals)(
      'the spectator calling %s is FORBIDDEN before anything is locked',
      async (_, call) => {
        await expect(call(service, DUDA_ID, envenenado)).rejects.toMatchObject({
          code: 'FORBIDDEN',
        });
        expect(scenes.journal).toEqual([]);
        expect(vharnDefinitionNames()).toEqual(['Envenenado', 'Cego']);
      },
    );
  });
});

function envenenadoEditOf(
  conditionId: string,
  overrides: Partial<UpdateConditionDefinition> = {},
): UpdateConditionDefinition {
  return {
    conditionId,
    name: 'Envenenado',
    tone: 'harm',
    icon: 'flask-conical',
    look: null,
    color: null,
    description: 'Desvantagem em ataques.',
    maxStacks: null,
    imageAssetId: null,
    ...overrides,
  };
}

/** Records, at each `condition:definitionUpdated`, the stacks the active conditions hold. */
class StacksAtPublishPublisherFake extends BoardPublisherFake {
  readonly stacksAtPublish: number[][] = [];

  constructor(
    private readonly conditionsDao: ConditionsDaoFake,
    journal: string[],
  ) {
    super(journal);
  }

  override conditionDefinitionUpdated(event: ConditionDefinitionUpdatedDto): void {
    this.stacksAtPublish.push(this.conditionsDao.active.map(({ stacks }) => stacks));
    super.conditionDefinitionUpdated(event);
  }
}
