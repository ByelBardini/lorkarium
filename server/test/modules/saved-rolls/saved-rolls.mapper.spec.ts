import { describe, expect, it } from 'vitest';
import {
  toNewSavedRollPo,
  toSavedRollChangesPo,
  toSavedRollDto,
} from '../../../src/modules/saved-rolls/saved-rolls.mapper';
import { BIA_ID, VHARN_ID } from '../../support/campaigns-factories';
import { ACERTO_ID, savedRollPo } from '../../support/saved-rolls-fakes';

const BLESS = [{ label: 'Bênção', expression: '1d4' }];

describe('toSavedRollDto', () => {
  it('keeps id, name and pieces and leaves out the table, owner, key and dates', () => {
    expect(toSavedRollDto(savedRollPo())).toEqual({
      id: ACERTO_ID,
      name: 'Acerto',
      parts: [{ label: null, expression: '1d20+5' }],
    });
  });
});

describe('toNewSavedRollPo', () => {
  it('"Bênção" of Bia at Vharn goes with the key "bencao"', () => {
    const owner = { campaignId: VHARN_ID, userId: BIA_ID };

    expect(toNewSavedRollPo(owner, { name: 'Bênção', parts: BLESS })).toEqual({
      campaignId: VHARN_ID,
      userId: BIA_ID,
      name: 'Bênção',
      nameKey: 'bencao',
      parts: BLESS,
    });
  });
});

describe('toSavedRollChangesPo', () => {
  it('a new name goes with its key', () => {
    expect(toSavedRollChangesPo({ name: 'ACÉRTO' })).toEqual({ name: 'ACÉRTO', nameKey: 'acerto' });
  });

  it('only the pieces write only the pieces', () => {
    expect(toSavedRollChangesPo({ parts: BLESS })).toEqual({ parts: BLESS });
  });
});
