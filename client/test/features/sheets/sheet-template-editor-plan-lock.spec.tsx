import { PLAN_LIMITS } from '@lorkarium/contracts';
import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { SheetTemplateEditor } from '@/features/sheets/sheet-template-editor';
import { createSheetTemplateDraftStore } from '@/stores/sheet-template-draft-store';
import { VHARN } from '../../support/campaigns-api-fake';
import { TORMENTA_TEMPLATE_ID } from '../../support/sheet-fixtures';
import { SheetChannelsFake } from '../../support/sheet-frame-fakes';
import { tormentaTemplate } from '../../support/sheet-template-fixtures';
import { SheetTemplatesApiFake } from '../../support/sheet-templates-api-fake';
import { codeViewOf } from '../../support/code-editor-input';
import { onTablePlan } from '../../support/table-plan';

const TEMPLATE_LOCKED =
  'Este modelo de ficha passou do limite do plano Grátis (1) e está só leitura: criar fichas com ele segue livre. Apague um modelo mais antigo ou suba de plano.';

let api: SheetTemplatesApiFake;

beforeEach(() => {
  api = new SheetTemplatesApiFake();
});

async function openTormenta(planLocked: boolean): Promise<HTMLElement> {
  api.templates.set(TORMENTA_TEMPLATE_ID, tormentaTemplate({ planLocked }));
  const draft = createSheetTemplateDraftStore({
    api,
    campaignId: VHARN.id,
    templateId: TORMENTA_TEMPLATE_ID,
  });
  render(
    onTablePlan(
      PLAN_LIMITS.free,
      <SheetTemplateEditor draft={draft} live createChannel={new SheetChannelsFake().create} />,
    ),
  );
  await screen.findByRole('textbox', { name: 'Arquivo index.html' });
  return screen.getByRole('region', { name: 'Editor do modelo' });
}

describe('SheetTemplateEditor of a template past the plan ceiling', () => {
  it('a planLocked template shows the lock and the sentence, with the name and Salvar off', async () => {
    const editor = await openTormenta(true);
    expect(within(editor).getByRole('img', { name: 'Só leitura' })).toBeVisible();
    expect(within(editor).getByText(TEMPLATE_LOCKED)).toBeVisible();
    expect(within(editor).getByRole('textbox', { name: 'Nome do modelo' })).toBeDisabled();
    expect(within(editor).getByRole('button', { name: 'Salvar' })).toBeDisabled();
    expect(within(editor).getByRole('button', { name: 'Salvar' })).toHaveAccessibleDescription(
      TEMPLATE_LOCKED,
    );
  });

  it.each(['Arquivo index.html', 'Manifesto do modelo'])(
    'a planLocked template opens "%s" read only (typing goes nowhere)',
    async (label) => {
      await openTormenta(true);
      expect(screen.getByRole('textbox', { name: label, hidden: true })).toHaveAttribute(
        'aria-readonly',
        'true',
      );
      expect(codeViewOf(label).state.readOnly).toBe(true);
    },
  );

  it('without planLocked the code fields stay editable', async () => {
    await openTormenta(false);
    expect(codeViewOf('Arquivo index.html').state.readOnly).toBe(false);
    expect(codeViewOf('Manifesto do modelo').state.readOnly).toBe(false);
  });

  it('without planLocked nothing changes: no lock, the name editable', async () => {
    const editor = await openTormenta(false);
    expect(within(editor).queryByRole('img', { name: 'Só leitura' })).toBeNull();
    expect(within(editor).getByRole('textbox', { name: 'Nome do modelo' })).toBeEnabled();
  });
});
