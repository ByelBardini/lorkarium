import { savedTokenBodyDto } from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import {
  assetIdsOf,
  toNewSavedTokenRows,
  toSavedTokenDto,
  toSavedTokenWrite,
} from '../../../src/modules/saved-tokens/saved-tokens.mapper';
import { BIA_ID, VHARN_ID } from '../../support/campaigns-factories';
import { rottenFormPo } from '../../support/saved-tokens-factories';
import { ZOMBIE_ID, savedTokenRowPo } from '../../support/saved-tokens-fakes';

const PORTRAIT = '11111111-1111-4111-8111-111111111111';
const AURA_IMAGE = '22222222-2222-4222-8222-222222222222';
const FORM_IMAGE = '33333333-3333-4333-8333-333333333333';

function zombieBody(overrides: Record<string, unknown> = {}) {
  return savedTokenBodyDto.parse({
    name: 'Zumbi',
    initials: 'ZB',
    side: 'enemy',
    width: 1,
    height: 1,
    imageAssetId: PORTRAIT,
    aura: { kind: 'image', radius: 2, opacity: 80, imageAssetId: AURA_IMAGE, shape: 'round' },
    bars: [{ label: 'PV', current: 7, max: 12, color: '#cc2222', visibility: 'everyone' }],
    forms: [{ name: 'Podre', imageAssetId: FORM_IMAGE, width: 2, height: 2, frame: 'round' }],
    activeForm: 0,
    ...overrides,
  });
}

describe('toSavedTokenWrite', () => {
  it('the portrait, the aura image and the active form leave the json for their columns', () => {
    const { columns, forms } = toSavedTokenWrite(zombieBody());

    expect(columns).toMatchObject({
      imageAssetId: PORTRAIT,
      auraImageAssetId: AURA_IMAGE,
      activeForm: 0,
    });
    expect(columns.body.aura).toEqual({ kind: 'image', radius: 2, opacity: 80, shape: 'round' });
    expect(columns.body).not.toHaveProperty('imageAssetId');
    expect(columns.body).not.toHaveProperty('forms');
    expect(forms).toEqual([rottenFormPo(FORM_IMAGE)]);
  });

  it('a color aura stays whole in the json and leaves no aura image', () => {
    const aura = { kind: 'color', radius: 1, opacity: 60, color: '#22aa44' };
    const { columns } = toSavedTokenWrite(zombieBody({ aura }));

    expect(columns.auraImageAssetId).toBeNull();
    expect(columns.body.aura).toEqual(aura);
  });
});

describe('toNewSavedTokenRows', () => {
  it('the row carries the owner, the entry name and no folder when none came', () => {
    const owner = { campaignId: VHARN_ID, userId: BIA_ID };
    const { row } = toNewSavedTokenRows(owner, { name: 'Zumbi do Kael', token: zombieBody() });

    expect(row).toMatchObject({ ...owner, name: 'Zumbi do Kael', folderId: null });
  });
});

describe('assetIdsOf', () => {
  it('names the portrait, the aura image and every form image', () => {
    expect(assetIdsOf(zombieBody())).toEqual([PORTRAIT, AURA_IMAGE, FORM_IMAGE]);
  });
});

describe('toSavedTokenDto', () => {
  it('a written body reads back as it was sent', () => {
    const body = zombieBody();
    const { columns, forms } = toSavedTokenWrite(body);
    const row = savedTokenRowPo(columns);
    const withForms = {
      ...row,
      forms: forms.map((form, position) => ({ ...form, savedTokenId: ZOMBIE_ID, position })),
    };

    expect(toSavedTokenDto(withForms, false)).toEqual({
      id: ZOMBIE_ID,
      name: 'Zumbi',
      folderId: null,
      token: body,
      planLocked: false,
    });
  });

  it('an image aura whose file is gone reads as no aura, and the lost portrait as initials', () => {
    const { columns } = toSavedTokenWrite(zombieBody({ forms: [], activeForm: null }));
    const row = savedTokenRowPo({ ...columns, imageAssetId: null, auraImageAssetId: null });

    const dto = toSavedTokenDto(row, true);

    expect(dto.token.aura).toBeNull();
    expect(dto.token.imageAssetId).toBeNull();
    expect(dto.planLocked).toBe(true);
  });
});
