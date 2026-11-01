import { describe, expect, it } from 'vitest';
import {
  CampaignAccessBo,
  type CampaignRole,
} from '../../../src/modules/campaigns/campaign-access.bo';
import {
  SheetAccessBo,
  type SheetHolderReach,
  type SheetReach,
} from '../../../src/modules/sheets/sheet-access.bo';
import { ANA_ID } from '../../support/auth-factories';
import { BIA_ID, CAIO_ID, DUDA_ID, VHARN_ID } from '../../support/campaigns-factories';
import { LYRA_SHEET_ID, lyraPlace } from '../../support/sheets-fakes';
import { BRAM_ID } from '../../support/tokens-factories';

const LYRA: SheetHolderReach = { character: lyraPlace() };

function rulesOf(
  userId: string,
  role: CampaignRole,
  reach: Partial<SheetReach> = {},
): SheetAccessBo {
  const access = new CampaignAccessBo({ campaignId: VHARN_ID, userId, role });
  return new SheetAccessBo(access, {
    sheetId: LYRA_SHEET_ID,
    visibility: 'controllers',
    holder: LYRA,
    ...reach,
  });
}

function abilitiesOf(rules: SheetAccessBo): Readonly<Record<string, boolean>> {
  return { read: rules.canRead(), edit: rules.canEdit(), manage: rules.canManage() };
}

const ALL = { read: true, edit: true, manage: true };
const EDITS = { read: true, edit: true, manage: false };
const READS = { read: true, edit: false, manage: false };
const NOTHING = { read: false, edit: false, manage: false };

describe('SheetAccessBo, a sheet of a character', () => {
  it('the master reads, edits and manages it', () => {
    expect(abilitiesOf(rulesOf(ANA_ID, 'master'))).toEqual(ALL);
  });

  it('Bia, the player of Lyra, reads and edits it but does not manage it', () => {
    expect(abilitiesOf(rulesOf(BIA_ID, 'player'))).toEqual(EDITS);
  });

  it('Caio, listed in the control of Lyra, edits it too', () => {
    const holder = { character: lyraPlace({ controllerIds: [BIA_ID, CAIO_ID] }) };
    expect(abilitiesOf(rulesOf(CAIO_ID, 'player', { holder }))).toEqual(EDITS);
  });

  it('Caio on a controllers sheet of Lyra reads nothing', () => {
    expect(abilitiesOf(rulesOf(CAIO_ID, 'player'))).toEqual(NOTHING);
  });

  it.each([
    ['Caio', CAIO_ID, 'player'],
    ['Duda the spectator', DUDA_ID, 'spectator'],
  ] as const)('%s reads a table sheet of Lyra without editing it', (_name, userId, role) => {
    expect(abilitiesOf(rulesOf(userId, role, { visibility: 'table' }))).toEqual(READS);
  });

  it.each([
    ['without a player (she left)', lyraPlace({ userId: null, holderRole: null })],
    ['whose player is a spectator (demoted)', lyraPlace({ holderRole: 'spectator' })],
  ])('a character %s: only the masters find its sheets', (_what, place) => {
    const reach = { holder: { character: place }, visibility: 'table' } as const;

    expect(abilitiesOf(rulesOf(ANA_ID, 'master', reach))).toEqual(ALL);
    expect(abilitiesOf(rulesOf(CAIO_ID, 'player', reach))).toEqual(NOTHING);
    expect(abilitiesOf(rulesOf(BIA_ID, 'spectator', reach))).toEqual(NOTHING);
  });

  it('Bia demoted to spectator keeps no right on her own sheet', () => {
    expect(abilitiesOf(rulesOf(BIA_ID, 'spectator'))).toEqual(NOTHING);
  });

  it('an unreadable sheet is SHEET_NOT_FOUND, never FORBIDDEN', () => {
    expect(() => rulesOf(CAIO_ID, 'player').requireEdit('write values of')).toThrow(
      expect.objectContaining({ code: 'SHEET_NOT_FOUND' }),
    );
  });

  it('Caio writing on a table sheet he reads is FORBIDDEN, citing its holder', () => {
    const rules = rulesOf(CAIO_ID, 'player', { visibility: 'table' });
    expect(() => rules.requireEdit('write values of')).toThrow(
      expect.objectContaining({
        code: 'FORBIDDEN',
        message: expect.stringContaining('control of its holder'),
      }),
    );
  });

  it('Bia managing her sheet is FORBIDDEN', () => {
    expect(() => rulesOf(BIA_ID, 'player').requireManage('manage')).toThrow(
      expect.objectContaining({ code: 'FORBIDDEN' }),
    );
  });
});

describe('SheetAccessBo, a sheet of a loose token', () => {
  const bram = (seen: boolean): SheetHolderReach => ({
    token: { tokenId: BRAM_ID, controllerIds: [CAIO_ID] },
    seen,
  });

  it('Caio, its controller, edits it; Bia reads only a table one', () => {
    expect(abilitiesOf(rulesOf(CAIO_ID, 'player', { holder: bram(true) }))).toEqual(EDITS);
    expect(abilitiesOf(rulesOf(BIA_ID, 'player', { holder: bram(true) }))).toEqual(NOTHING);
    const table = { holder: bram(true), visibility: 'table' } as const;
    expect(abilitiesOf(rulesOf(BIA_ID, 'player', table))).toEqual(READS);
  });

  it('a token on a grid the reader does not see hides its sheet, even a table one', () => {
    const rules = rulesOf(CAIO_ID, 'player', { visibility: 'table', holder: bram(false) });
    expect(rules.canRead()).toBe(false);
  });
});

describe('SheetAccessBo, a sheet nobody holds', () => {
  it('masters read, edit and manage it, nobody else finds it', () => {
    expect(abilitiesOf(rulesOf(ANA_ID, 'master', { holder: null }))).toEqual(ALL);
    const table = { holder: null, visibility: 'table' } as const;
    expect(abilitiesOf(rulesOf(BIA_ID, 'player', table))).toEqual(NOTHING);
    expect(() => rulesOf(DUDA_ID, 'spectator', { holder: null }).requireRead()).toThrow(
      expect.objectContaining({ code: 'SHEET_NOT_FOUND' }),
    );
  });
});
