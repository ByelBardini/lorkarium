import { beforeEach, describe, expect, it } from 'vitest';
import { SheetTemplatesService } from '../../../src/modules/sheets/sheet-templates.service';
import { VHARN_ID } from '../../support/campaigns-factories';
import { planAccount } from '../../support/plan-account-fakes';
import {
  SheetTemplatesHarness,
  TORMENTA_ID,
  sheetTemplatePo,
} from '../../support/sheet-templates-fakes';

const ORDEM_ID = '6a7b8c9d-0e1f-4a2b-8c3d-5e6f7a8b9c0d';

describe('the templates of a table fallen to free (1 template)', () => {
  let h: SheetTemplatesHarness;
  let service: SheetTemplatesService;

  beforeEach(() => {
    h = new SheetTemplatesHarness();
    h.templates.rows.push(
      sheetTemplatePo({ id: TORMENTA_ID }),
      sheetTemplatePo({ id: ORDEM_ID, campaignId: VHARN_ID, name: 'Ordem' }),
    );
    h.campaigns.owner = planAccount({ plan: 'free' });
    service = new SheetTemplatesService(h.deps);
  });

  it('saving the 2nd template is refused with PLAN_LIMIT readOnly, before the version check', async () => {
    const update = service.update(h.requester, ORDEM_ID, { expectedVersion: 9, name: 'Nova' });

    await expect(update).rejects.toThrow(
      expect.objectContaining({
        code: 'PLAN_LIMIT',
        reason: 'readOnly',
        resource: 'sheetTemplates',
        stored: 2,
        limit: 1,
      }),
    );
    expect(h.journal).toEqual(['lock']);
  });

  it('saving the 1st template passes and the editor gets planLocked false', async () => {
    const saved = await service.update(h.requester, TORMENTA_ID, {
      expectedVersion: 0,
      name: 'T20',
    });

    expect(saved).toMatchObject({ name: 'T20', version: 1, planLocked: false });
  });

  it('deleting the 2nd template passes', async () => {
    await service.delete(h.requester, ORDEM_ID);

    expect(h.templates.rows.map(({ id }) => id)).not.toContain(ORDEM_ID);
  });

  it('the editor read of the 2nd template says planLocked', async () => {
    expect((await service.get(h.requester, ORDEM_ID)).planLocked).toBe(true);
  });
});
