import {
  UNNAMED_SHEET_TEMPLATE_NAME,
  type CreateSheetTemplateRequestDto,
  type SheetTemplateDto,
  type UpdateSheetTemplateRequestDto,
} from '@lorkarium/contracts';
import type { SheetTemplatesApi, SheetTemplatesResult } from '@/services/sheet-templates-api';
import { NEW_TEMPLATE_ID, tormentaTemplate } from './sheet-template-fixtures';

type Recorded<T> = Readonly<{ campaignId: string; templateId: string; input: T }>;

/** The master's templates on an in-memory server: `update` refuses a stale `expectedVersion`
 *  with `conflict` and bumps the version; `create` answers `NEW_TEMPLATE_ID`; `answer` overrides
 *  the next write; `detailResult` overrides the reads, `detailCalls` counts them.
 *
 *  Example: `api.templates.set(id, tormentaTemplate({ version: 4 })) // another master saved` */
export class SheetTemplatesApiFake implements SheetTemplatesApi {
  readonly templates = new Map<string, SheetTemplateDto>([
    [tormentaTemplate().id, tormentaTemplate()],
  ]);
  readonly creates: Recorded<CreateSheetTemplateRequestDto>[] = [];
  readonly updates: Recorded<UpdateSheetTemplateRequestDto>[] = [];
  readonly removals: string[] = [];
  /** The template ids read by `detail`, in order. */
  readonly detailCalls: string[] = [];
  answer: SheetTemplatesResult<never> | null = null;
  detailResult: SheetTemplatesResult<SheetTemplateDto> | null = null;

  async detail(_: string, templateId: string): Promise<SheetTemplatesResult<SheetTemplateDto>> {
    this.detailCalls.push(templateId);
    if (this.detailResult) return this.detailResult;
    const template = this.templates.get(templateId);
    return template ? { ok: true, value: template } : notFound();
  }
  async create(
    campaignId: string,
    input: CreateSheetTemplateRequestDto,
  ): Promise<SheetTemplatesResult<SheetTemplateDto>> {
    this.creates.push({ campaignId, templateId: NEW_TEMPLATE_ID, input });
    if (this.answer) return this.answer;
    const name = input.name ?? UNNAMED_SHEET_TEMPLATE_NAME;
    const template = tormentaTemplate({ ...input, id: NEW_TEMPLATE_ID, name, version: 1 });
    this.templates.set(NEW_TEMPLATE_ID, template);
    return { ok: true, value: template };
  }
  async update(
    campaignId: string,
    templateId: string,
    input: UpdateSheetTemplateRequestDto,
  ): Promise<SheetTemplatesResult<SheetTemplateDto>> {
    this.updates.push({ campaignId, templateId, input });
    if (this.answer) return this.answer;
    const current = this.templates.get(templateId);
    if (!current) return notFound();
    if (current.version !== input.expectedVersion)
      return { ok: false, failure: { kind: 'conflict' } };
    const { expectedVersion, ...changes } = input;
    const saved = { ...current, ...changes, version: expectedVersion + 1 };
    this.templates.set(templateId, saved);
    return { ok: true, value: saved };
  }
  async remove(_: string, templateId: string): Promise<SheetTemplatesResult<null>> {
    this.removals.push(templateId);
    if (this.answer) return this.answer;
    return this.templates.delete(templateId) ? { ok: true, value: null } : notFound();
  }
}

function notFound(): SheetTemplatesResult<never> {
  return { ok: false, failure: { kind: 'not_found' } };
}
