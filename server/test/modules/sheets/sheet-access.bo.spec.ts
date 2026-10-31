import { describe, expect, it } from 'vitest';
import {
  CampaignAccessBo,
  type CampaignRole,
} from '../../../src/modules/campaigns/campaign-access.bo';
import { SheetAccessBo, type SheetReach } from '../../../src/modules/sheets/sheet-access.bo';
import { ANA_ID } from '../../support/auth-factories';
import { BIA_ID, CAIO_ID, DUDA_ID, VHARN_ID } from '../../support/campaigns-factories';
import { LYRA_ANCHOR_ID, LYRA_SHEET_ID } from '../../support/sheets-fakes';

function rulesOf(
  userId: string,
  role: CampaignRole,
  reach: Partial<SheetReach> = {},
): SheetAccessBo {
  const access = new CampaignAccessBo({ campaignId: VHARN_ID, userId, role });
  return new SheetAccessBo(access, {
    sheetId: LYRA_SHEET_ID,
    visibility: 'controllers',
    holder: { tokenId: LYRA_ANCHOR_ID, controllerIds: [BIA_ID] },
    holderSeen: true,
    ...reach,
  });
}

function abilitiesOf(rules: SheetAccessBo): Readonly<Record<string, boolean>> {
  return { read: rules.canRead(), edit: rules.canEdit(), manage: rules.canManage() };
}

describe('SheetAccessBo', () => {
  it('the master reads, edits and manages any sheet', () => {
    expect(abilitiesOf(rulesOf(ANA_ID, 'master'))).toEqual({
      read: true,
      edit: true,
      manage: true,
    });
  });

  it('Bia, controller of Lyra, reads and edits but does not manage', () => {
    expect(abilitiesOf(rulesOf(BIA_ID, 'player'))).toEqual({
      read: true,
      edit: true,
      manage: false,
    });
  });

  it('Caio on a controllers sheet reads nothing', () => {
    expect(abilitiesOf(rulesOf(CAIO_ID, 'player'))).toEqual({
      read: false,
      edit: false,
      manage: false,
    });
  });

  it.each([
    ['Caio', CAIO_ID, 'player'],
    ['Duda the spectator', DUDA_ID, 'spectator'],
  ] as const)('%s reads a table sheet without editing it', (_name, userId, role) => {
    expect(abilitiesOf(rulesOf(userId, role, { visibility: 'table' }))).toEqual({
      read: true,
      edit: false,
      manage: false,
    });
  });

  it('a spectator still listed in the control (demoted Bia) is treated like Caio', () => {
    expect(abilitiesOf(rulesOf(BIA_ID, 'spectator'))).toEqual({
      read: false,
      edit: false,
      manage: false,
    });
  });

  it('a token on a grid the reader does not see hides its sheet, even a table one', () => {
    const rules = rulesOf(BIA_ID, 'player', { visibility: 'table', holderSeen: false });
    expect(rules.canRead()).toBe(false);
  });

  it('an unreadable sheet is SHEET_NOT_FOUND, never FORBIDDEN', () => {
    expect(() => rulesOf(CAIO_ID, 'player').requireEdit('write values of')).toThrow(
      expect.objectContaining({ code: 'SHEET_NOT_FOUND' }),
    );
  });

  it('Caio writing on a table sheet he reads is FORBIDDEN', () => {
    const rules = rulesOf(CAIO_ID, 'player', { visibility: 'table' });
    expect(() => rules.requireEdit('write values of')).toThrow(
      expect.objectContaining({ code: 'FORBIDDEN' }),
    );
  });

  it('Bia managing her sheet is FORBIDDEN', () => {
    expect(() => rulesOf(BIA_ID, 'player').requireManage('manage')).toThrow(
      expect.objectContaining({ code: 'FORBIDDEN' }),
    );
  });

  it('a sheet nobody holds: masters read, edit and manage it, nobody else finds it', () => {
    const unheld = { holder: null, holderSeen: false };

    expect(abilitiesOf(rulesOf(ANA_ID, 'master', unheld))).toEqual({
      read: true,
      edit: true,
      manage: true,
    });
    expect(abilitiesOf(rulesOf(BIA_ID, 'player', { ...unheld, visibility: 'table' }))).toEqual({
      read: false,
      edit: false,
      manage: false,
    });
    expect(() => rulesOf(DUDA_ID, 'spectator', unheld).requireRead()).toThrow(
      expect.objectContaining({ code: 'SHEET_NOT_FOUND' }),
    );
  });
});
