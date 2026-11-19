import { describe, expect, it } from 'vitest';
import {
  CampaignAccessBo,
  type CampaignRole,
} from '../../../src/modules/campaigns/campaign-access.bo';
import { SheetTemplateBo } from '../../../src/modules/sheets/sheet-template.bo';
import { ANA_ID } from '../../support/auth-factories';
import { VHARN_ID } from '../../support/campaigns-factories';
import { ATO_1_ID, QUELM_FOLDER_ID } from '../../support/library-factories';
import { TORMENTA_ID } from '../../support/sheet-templates-fakes';

function rulesOf(role: CampaignRole): SheetTemplateBo {
  return new SheetTemplateBo(new CampaignAccessBo({ campaignId: VHARN_ID, userId: ANA_ID, role }));
}

const TORMENTA = { id: TORMENTA_ID, version: 3 };

describe('SheetTemplateBo', () => {
  it('the master authors templates', () => {
    expect(() => rulesOf('master').requireAuthor('create a sheet template')).not.toThrow();
  });

  it.each(['player', 'spectator'] as const)('a %s authoring a template is FORBIDDEN', (role) => {
    expect(() => rulesOf(role).requireAuthor('create a sheet template')).toThrow(
      expect.objectContaining({ code: 'FORBIDDEN' }),
    );
  });

  it('saving at the version read passes', () => {
    expect(() => rulesOf('master').requireVersion(TORMENTA, 3)).not.toThrow();
  });

  it('saving at an older version is SHEET_TEMPLATE_VERSION_CONFLICT citing both', () => {
    expect(() => rulesOf('master').requireVersion(TORMENTA, 2)).toThrow(
      expect.objectContaining({
        code: 'SHEET_TEMPLATE_VERSION_CONFLICT',
        message: `Sheet template ${TORMENTA_ID} version 3; expected 2`,
      }),
    );
  });

  it('a template without sheets may go', () => {
    expect(() => rulesOf('master').requireUnused(TORMENTA, 0)).not.toThrow();
  });

  it('a template run by 1 sheet is SHEET_TEMPLATE_IN_USE citing the count', () => {
    expect(() => rulesOf('master').requireUnused(TORMENTA, 1)).toThrow(
      expect.objectContaining({
        code: 'SHEET_TEMPLATE_IN_USE',
        message: `Sheet template ${TORMENTA_ID} is used by 1 sheets; expected none`,
      }),
    );
  });

  it('the root and a folder of the table are known', () => {
    const rules = rulesOf('master');
    expect(() => rules.requireFolder([ATO_1_ID], null)).not.toThrow();
    expect(() => rules.requireFolder([ATO_1_ID], ATO_1_ID)).not.toThrow();
  });

  it('a folder outside the table is FOLDER_NOT_FOUND', () => {
    expect(() => rulesOf('master').requireFolder([ATO_1_ID], QUELM_FOLDER_ID)).toThrow(
      expect.objectContaining({ code: 'FOLDER_NOT_FOUND' }),
    );
  });
});
