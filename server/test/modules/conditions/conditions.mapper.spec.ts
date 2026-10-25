import { describe, expect, it } from 'vitest';
import {
  conditionsByToken,
  toActiveConditionDto,
  toConditionDefinitionDto,
  toNewConditionDefinition,
} from '../../../src/modules/conditions/conditions.mapper';

const ENVENENADO = {
  id: 'active-1',
  tokenId: 'lyra',
  conditionId: 'env',
  name: 'Envenenado',
  tone: 'harm',
  icon: 'flask-conical',
  look: null,
  color: null,
  description: '',
  maxStacks: null,
  imageAssetId: null,
  stacks: 1,
  remainingRounds: 2,
  appliedRound: 1,
} as const;

describe('conditions mapper', () => {
  it('a definition carries id, name, tone, icon, look and its description, not the table nor the date', () => {
    const po = {
      id: 'para',
      campaignId: 'vharn',
      name: 'Inconsciente',
      tone: 'incapacitating',
      icon: 'moon',
      look: 'unconscious',
      color: null,
      description: 'Cai e larga o que segura.',
      maxStacks: null,
      imageAssetId: null,
      createdAt: new Date(),
    } as const;
    expect(toConditionDefinitionDto(po)).toEqual({
      id: 'para',
      name: 'Inconsciente',
      tone: 'incapacitating',
      icon: 'moon',
      look: 'unconscious',
      color: null,
      description: 'Cai e larga o que segura.',
      maxStacks: null,
      imageAssetId: null,
    });
  });

  it('an active condition carries its definition and its rounds, not the token nor the round it was applied in', () => {
    expect(toActiveConditionDto(ENVENENADO)).toEqual({
      id: 'active-1',
      conditionId: 'env',
      name: 'Envenenado',
      tone: 'harm',
      icon: 'flask-conical',
      look: null,
      color: null,
      description: '',
      maxStacks: null,
      imageAssetId: null,
      stacks: 1,
      remainingRounds: 2,
    });
  });

  it('an active condition carries the description of its definition', () => {
    const described = { ...ENVENENADO, description: 'Desvantagem em ataques.' };
    expect(toActiveConditionDto(described).description).toBe('Desvantagem em ataques.');
  });

  it('a new definition keeps only its own fields: the envelope of the command stays out', () => {
    const command = {
      actionId: 'a1b2c3d4-0000-4000-8000-000000000001',
      sceneId: 'torre',
      conditionId: 'env',
      name: 'Envenenado',
      tone: 'harm',
      icon: 'flask-conical',
      look: null,
      color: null,
      description: 'Desvantagem em ataques.',
      maxStacks: null,
      imageAssetId: null,
    } as const;
    expect(toNewConditionDefinition(command)).toEqual({
      name: 'Envenenado',
      tone: 'harm',
      icon: 'flask-conical',
      look: null,
      color: null,
      description: 'Desvantagem em ataques.',
      maxStacks: null,
      imageAssetId: null,
    });
  });

  it('an active condition carries the look of its definition', () => {
    const invisivel = {
      ...ENVENENADO,
      name: 'Invisível',
      tone: 'benefit',
      look: 'invisible',
    } as const;
    expect(toActiveConditionDto(invisivel)).toMatchObject({ tone: 'benefit', look: 'invisible' });
  });

  it('conditions are grouped by token', () => {
    const grouped = conditionsByToken([
      ENVENENADO,
      { ...ENVENENADO, id: 'active-2', tokenId: 'kael' },
      { ...ENVENENADO, id: 'active-3', name: 'Caído', remainingRounds: null },
    ]);
    expect(grouped.get('lyra')?.map(({ id }) => id)).toEqual(['active-1', 'active-3']);
    expect(grouped.get('kael')).toHaveLength(1);
    expect(grouped.get('goblin')).toBeUndefined();
  });

  it('a stacking definition carries its maxStacks 5', () => {
    const po = {
      id: 'sangrando',
      campaignId: 'vharn',
      name: 'Sangrando',
      tone: 'harm',
      icon: 'droplet',
      look: null,
      description: '',
      maxStacks: 5,
      color: null,
      imageAssetId: null,
      createdAt: new Date(),
    } as const;
    expect(toConditionDefinitionDto(po).maxStacks).toBe(5);
  });

  it('an active stacking condition carries its 3 stacks and the maxStacks 5 of its definition', () => {
    const sangrando = { ...ENVENENADO, name: 'Sangrando', maxStacks: 5, stacks: 3 };
    expect(toActiveConditionDto(sangrando)).toMatchObject({ maxStacks: 5, stacks: 3 });
  });

  it('a new definition keeps the maxStacks 4 of the command', () => {
    const command = {
      name: 'Sangrando',
      tone: 'harm',
      icon: 'droplet',
      look: null,
      description: '',
      maxStacks: 4,
      color: null,
      imageAssetId: null,
    } as const;
    expect(toNewConditionDefinition(command).maxStacks).toBe(4);
  });

  describe('the image of a condition', () => {
    const IMAGE_ID = 'img-cego';

    it('a new definition keeps the imageAssetId of the command', () => {
      const command = {
        name: 'Cego',
        tone: 'harm',
        icon: 'eye-off',
        look: null,
        color: null,
        description: '',
        maxStacks: null,
        imageAssetId: IMAGE_ID,
      } as const;
      expect(toNewConditionDefinition(command).imageAssetId).toBe(IMAGE_ID);
    });

    it('a definition carries the imageAssetId of its row', () => {
      const po = {
        id: 'cego',
        campaignId: 'vharn',
        name: 'Cego',
        tone: 'harm',
        icon: 'eye-off',
        look: null,
        color: null,
        description: '',
        maxStacks: null,
        imageAssetId: IMAGE_ID,
        createdAt: new Date(),
      } as const;
      expect(toConditionDefinitionDto(po).imageAssetId).toBe(IMAGE_ID);
    });

    it('an active condition carries the imageAssetId of its definition', () => {
      const pictured = { ...ENVENENADO, imageAssetId: IMAGE_ID };
      expect(toActiveConditionDto(pictured).imageAssetId).toBe(IMAGE_ID);
    });

    it('an active condition without an image keeps imageAssetId null', () => {
      expect(toActiveConditionDto(ENVENENADO).imageAssetId).toBeNull();
    });
  });
});
