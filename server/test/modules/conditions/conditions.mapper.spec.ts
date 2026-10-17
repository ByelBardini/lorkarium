import { describe, expect, it } from 'vitest';
import {
  conditionsByToken,
  toActiveConditionDto,
  toConditionDefinitionDto,
} from '../../../src/modules/conditions/conditions.mapper';

const ENVENENADO = {
  id: 'active-1',
  tokenId: 'lyra',
  conditionId: 'env',
  name: 'Envenenado',
  tone: 'harm',
  icon: 'flask-conical',
  remainingRounds: 2,
  appliedRound: 1,
} as const;

describe('conditions mapper', () => {
  it('a definition carries id, name, tone and icon only', () => {
    const po = {
      id: 'env',
      campaignId: 'vharn',
      name: 'Envenenado',
      tone: 'harm',
      icon: 'flask-conical',
      createdAt: new Date(),
    } as const;
    expect(toConditionDefinitionDto(po)).toEqual({
      id: 'env',
      name: 'Envenenado',
      tone: 'harm',
      icon: 'flask-conical',
    });
  });

  it('an active condition carries its definition and its rounds, not the token nor the round it was applied in', () => {
    expect(toActiveConditionDto(ENVENENADO)).toEqual({
      id: 'active-1',
      conditionId: 'env',
      name: 'Envenenado',
      tone: 'harm',
      icon: 'flask-conical',
      remainingRounds: 2,
    });
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
});
