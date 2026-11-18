import { PLAN_LIMITS } from '@lorkarium/contracts';
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

  describe("the plan's sheetScripts", () => {
    const INDEX = { path: 'index.html', content: '<p id="pv"></p>' };
    const STYLE = { path: 'style.css', content: 'p { color: red; }' };
    const SCRIPT_A = { path: 'scripts/a.js', content: 'lorkarium.ready();' };
    const STORED = [INDEX, STYLE, SCRIPT_A];
    const scriptsLimit = {
      code: 'PLAN_LIMIT',
      resource: 'sheetScripts',
      limit: 0,
      plan: 'free',
    };

    it('a narrador table creates a template with scripts/a.js', () => {
      const rules = rulesOf('master');
      expect(() => rules.requireScriptsAllowed([], STORED, PLAN_LIMITS.narrador)).not.toThrow();
    });

    it('a free table creates a template of only HTML and CSS', () => {
      const rules = rulesOf('master');
      expect(() => rules.requireScriptsAllowed([], [INDEX, STYLE], PLAN_LIMITS.free)).not.toThrow();
    });

    it('a free table saves again the .js it has, same path and same text, with a new HTML', () => {
      const next = [{ ...INDEX, content: '<h1>Nova</h1>' }, STYLE, { ...SCRIPT_A }];
      const rules = rulesOf('master');
      expect(() => rules.requireScriptsAllowed(STORED, next, PLAN_LIMITS.free)).not.toThrow();
    });

    it('a free table creating a template with scripts/a.js is PLAN_LIMIT sheetScripts', () => {
      expect(() => rulesOf('master').requireScriptsAllowed([], STORED, PLAN_LIMITS.free)).toThrow(
        expect.objectContaining(scriptsLimit),
      );
    });

    it('a free table changing the text of scripts/a.js is PLAN_LIMIT sheetScripts', () => {
      const next = [INDEX, STYLE, { ...SCRIPT_A, content: 'lorkarium.ready(); go();' }];
      expect(() => rulesOf('master').requireScriptsAllowed(STORED, next, PLAN_LIMITS.free)).toThrow(
        expect.objectContaining(scriptsLimit),
      );
    });

    it('a free table adding b.js next to the stored a.js is PLAN_LIMIT sheetScripts', () => {
      const next = [...STORED, { path: 'b.js', content: '' }];
      expect(() => rulesOf('master').requireScriptsAllowed(STORED, next, PLAN_LIMITS.free)).toThrow(
        expect.objectContaining(scriptsLimit),
      );
    });
  });
});
