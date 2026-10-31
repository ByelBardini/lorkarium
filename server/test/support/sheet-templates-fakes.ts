import type {
  SheetTemplateDaos,
  SheetTemplatesServiceDeps,
  TemplateUseCounter,
} from '../../src/modules/sheets/sheet-templates.service';
import type {
  NewSheetTemplatePo,
  SheetTemplateChangesPo,
  SheetTemplatePo,
} from '../../src/modules/sheets/sheet-templates.po';
import { ClockFake } from './auth-fakes';
import { ANA_ID } from './auth-factories';
import { CampaignMembersDaoFake, CampaignsDaoFake } from './campaigns-fakes';
import {
  BIA_ID,
  DUDA_ID,
  QUELM_ID,
  VHARN_ID,
  campaignMemberPo,
  campaignPo,
} from './campaigns-factories';
import { ATO_1_ID, QUELM_FOLDER_ID, sceneFolderPo } from './library-factories';
import { LibraryCampaignsDaoFake, SceneFoldersDaoFake } from './library-fakes';

export const TORMENTA_ID = '4e5f6a7b-8c9d-4e0f-8a1b-3c4d5e6f7a8b';
export const QUELM_TEMPLATE_ID = '5f6a7b8c-9d0e-4f1a-9b2c-4d5e6f7a8b9c';
export const SHEET_TEMPLATE_CODE = { html: '<p id="pv"></p>', css: 'p { color: red; }', js: '' };

/** Ficha Tormenta of Vharn, at the root, version 0, by Ana. */
export function sheetTemplatePo(overrides: Partial<SheetTemplatePo> = {}): SheetTemplatePo {
  return {
    id: TORMENTA_ID,
    campaignId: VHARN_ID,
    folderId: null,
    name: 'Ficha Tormenta',
    ...SHEET_TEMPLATE_CODE,
    version: 0,
    createdBy: ANA_ID,
    createdAt: new Date('2026-10-31T12:00:00Z'),
    updatedAt: new Date('2026-10-31T12:00:00Z'),
    ...overrides,
  };
}

/** In-memory sheet templates of every table; each write records its name in the journal. */
type TemplateOperations = SheetTemplateDaos['templates'];
export class SheetTemplatesDaoFake implements TemplateOperations {
  constructor(
    private readonly journal: string[],
    readonly rows: SheetTemplatePo[] = [],
  ) {}

  async findInCampaign(
    campaignId: string,
    templateId: string,
  ): Promise<SheetTemplatePo | undefined> {
    return this.rows.find((row) => row.campaignId === campaignId && row.id === templateId);
  }

  async insert(input: NewSheetTemplatePo): Promise<SheetTemplatePo> {
    this.journal.push('insert');
    const row = sheetTemplatePo({ ...input, id: input.id ?? TORMENTA_ID });
    this.rows.push(row);
    return row;
  }

  async update(
    campaignId: string,
    templateId: string,
    changes: SheetTemplateChangesPo,
  ): Promise<SheetTemplatePo> {
    this.journal.push('update');
    const row = await this.findInCampaign(campaignId, templateId);
    if (!row) throw new Error(`Missing sheet template ${templateId}`);
    return Object.assign(row, changes);
  }

  async delete(campaignId: string, templateId: string): Promise<void> {
    this.journal.push('delete');
    const index = this.rows.findIndex(
      (row) => row.campaignId === campaignId && row.id === templateId,
    );
    if (index >= 0) this.rows.splice(index, 1);
  }
}

/** How many sheets run each template, set by the spec. */
export class TemplateUseCounterFake implements TemplateUseCounter {
  readonly counts = new Map<string, number>();

  async countOfTemplate(_campaignId: string, templateId: string): Promise<number> {
    return this.counts.get(templateId) ?? 0;
  }
}

/** Ana masters Vharn, Bia plays and Duda watches; Vharn has the folder Ato 1 and Quelm its own
 *  folder and template. The journal reads `lock → … → commit → publish`. */
export class SheetTemplatesHarness {
  readonly journal: string[] = [];
  readonly templates = new SheetTemplatesDaoFake(this.journal, [
    sheetTemplatePo({ id: QUELM_TEMPLATE_ID, campaignId: QUELM_ID, name: 'Ficha de Quelm' }),
  ]);
  readonly uses = new TemplateUseCounterFake();
  readonly requester = { campaignId: VHARN_ID, userId: ANA_ID };
  readonly daos: SheetTemplateDaos = {
    campaigns: new LibraryCampaignsDaoFake(this.journal, [campaignPo({ id: VHARN_ID })]),
    folders: new SceneFoldersDaoFake(this.journal, [
      sceneFolderPo({ id: ATO_1_ID, campaignId: VHARN_ID, name: 'Sistemas' }),
      sceneFolderPo({ id: QUELM_FOLDER_ID, campaignId: QUELM_ID, name: 'Quelm' }),
    ]),
    templates: this.templates,
    uses: this.uses,
  };
  readonly members = new CampaignMembersDaoFake(new CampaignsDaoFake(), {}, [
    campaignMemberPo({ userId: ANA_ID, role: 'master', campaignId: VHARN_ID }),
    campaignMemberPo({ userId: BIA_ID, role: 'player', campaignId: VHARN_ID }),
    campaignMemberPo({ userId: DUDA_ID, role: 'spectator', campaignId: VHARN_ID }),
  ]);
  failCommit = false;
  readonly deps: SheetTemplatesServiceDeps = {
    members: this.members,
    read: this.daos,
    transaction: async (work) => {
      const saved = structuredClone(this.templates.rows);
      try {
        const result = await work(this.daos);
        if (this.failCommit) throw new Error('commit failed');
        this.journal.push('commit');
        return result;
      } catch (error) {
        this.templates.rows.splice(0, this.templates.rows.length, ...saved);
        throw error;
      }
    },
    clock: new ClockFake(new Date('2026-10-31T15:00:00Z')),
    publisher: { libraryChanged: () => void this.journal.push('publish') },
  };

  as(userId: string): { campaignId: string; userId: string } {
    return { campaignId: VHARN_ID, userId };
  }
}
