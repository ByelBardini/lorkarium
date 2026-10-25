import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { VHARN_GRID } from '../../support/table-session-fixtures';
import {
  conditionCard,
  conditionDefinition,
  editorSheet,
  renderCatalog,
} from './condition-catalog-harness';

const ENVENENADO = conditionDefinition({
  name: 'Envenenado',
  icon: 'skull',
  description: 'Desvantagem.',
});
const CAIDO = conditionDefinition({ name: 'Caído' });

async function openEditor(name: string): Promise<HTMLElement> {
  await userEvent.click(conditionCard(name));
  return editorSheet(`Editar ${name}`);
}

async function openNew(): Promise<HTMLElement> {
  await userEvent.click(screen.getByRole('button', { name: 'Nova condição' }));
  return editorSheet('Nova condição');
}

describe('ConditionEditorSheet (edit)', () => {
  it('opens at the condition: its values, the form named by it, nothing to save', async () => {
    renderCatalog([ENVENENADO]);
    const sheet = await openEditor('Envenenado');
    const form = within(sheet).getByRole('form', { name: 'Envenenado' });
    expect(within(form).getByLabelText('Nome')).toHaveValue('Envenenado');
    expect(within(form).getByLabelText('Descrição')).toHaveValue('Desvantagem.');
    expect(within(form).getByRole('button', { name: 'Salvar alterações' })).toBeDisabled();
  });

  it('"Salvar alterações" sends one condition:updateDefinition with the id, trimmed, the maxStacks kept', async () => {
    const { commands } = renderCatalog([{ ...ENVENENADO, maxStacks: 5 }]);
    const sheet = await openEditor('Envenenado');
    await userEvent.type(within(sheet).getByLabelText('Nome'), ' forte ');
    await userEvent.click(within(sheet).getByRole('button', { name: 'Salvar alterações' }));
    expect(commands.sentAs('updateConditionDefinition')).toEqual([
      {
        name: 'updateConditionDefinition',
        ...VHARN_GRID,
        fields: {
          conditionId: ENVENENADO.id,
          name: 'Envenenado forte',
          tone: 'harm',
          icon: 'skull',
          look: null,
          description: 'Desvantagem.',
          maxStacks: 5,
          color: null,
          imageAssetId: null,
        },
      },
    ]);
  });

  it('saving a condition that has an image sends its imageAssetId back, so the edit keeps it', async () => {
    const imageAssetId = 'f1e2d3c4-b5a6-4978-8a6b-5c4d3e2f1a0b';
    const { commands } = renderCatalog([{ ...ENVENENADO, imageAssetId }]);
    const sheet = await openEditor('Envenenado');
    await userEvent.type(within(sheet).getByLabelText('Nome'), ' forte');
    await userEvent.click(within(sheet).getByRole('button', { name: 'Salvar alterações' }));
    expect(commands.sentAs('updateConditionDefinition')).toEqual([
      expect.objectContaining({ fields: expect.objectContaining({ imageAssetId }) }),
    ]);
  });

  it('the confirmed edit restarts the form at the new definition, nothing left to save', async () => {
    const { commands, confirm } = renderCatalog([ENVENENADO]);
    const sheet = await openEditor('Envenenado');
    await userEvent.type(within(sheet).getByLabelText('Nome'), ' forte');
    commands.hold();
    await userEvent.click(within(sheet).getByRole('button', { name: 'Salvar alterações' }));
    confirm({
      type: 'conditionDefinitionUpdated',
      payload: { definition: { ...ENVENENADO, name: 'Envenenado forte' } },
    });
    await act(async () => commands.release());
    const restarted = editorSheet('Editar Envenenado forte');
    expect(within(restarted).getByLabelText('Nome')).toHaveValue('Envenenado forte');
    expect(within(restarted).getByRole('button', { name: 'Salvar alterações' })).toBeDisabled();
  });

  it("another master's new image of the open condition shows in the preview, nothing to save", async () => {
    const imageAssetId = 'f1e2d3c4-b5a6-4978-8a6b-5c4d3e2f1a0b';
    const { confirm } = renderCatalog([ENVENENADO]);
    await openEditor('Envenenado');
    confirm({
      type: 'conditionDefinitionUpdated',
      payload: { definition: { ...ENVENENADO, imageAssetId } },
    });
    const sheet = editorSheet('Editar Envenenado');
    const preview = within(sheet).getByText('No token:').nextElementSibling;
    expect(preview?.querySelector('img')).toHaveAttribute('src', `/api/assets/${imageAssetId}`);
    expect(within(sheet).getByRole('button', { name: 'Salvar alterações' })).toBeDisabled();
  });

  it("another master's edit of the open condition shows in the form", async () => {
    const { confirm } = renderCatalog([ENVENENADO]);
    await openEditor('Envenenado');
    confirm({
      type: 'conditionDefinitionUpdated',
      payload: { definition: { ...ENVENENADO, description: 'Desvantagem em tudo.' } },
    });
    expect(within(editorSheet('Editar Envenenado')).getByLabelText('Descrição')).toHaveValue(
      'Desvantagem em tudo.',
    );
  });

  it('the open condition deleted by an event closes the sheet', async () => {
    const { confirm } = renderCatalog([ENVENENADO, CAIDO]);
    await openEditor('Envenenado');
    confirm({ type: 'conditionDefinitionDeleted', payload: { conditionId: ENVENENADO.id } });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Editar Envenenado' })).toBeNull();
  });

  it('another condition deleted leaves the sheet open', async () => {
    const { confirm } = renderCatalog([ENVENENADO, CAIDO]);
    await openEditor('Envenenado');
    confirm({ type: 'conditionDefinitionDeleted', payload: { conditionId: CAIDO.id } });
    expect(editorSheet('Editar Envenenado')).toBeInTheDocument();
  });

  it('Esc on an untouched form closes the sheet', async () => {
    const { commands } = renderCatalog([ENVENENADO]);
    const sheet = await openEditor('Envenenado');
    await userEvent.type(within(sheet).getByLabelText('Descrição'), '{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(commands.sent).toEqual([]);
  });

  // Regression (red, 2026-10-24): Radix's Sheet hears Esc on `document` in the capture phase, before
  // the form's onKeyDown can preventDefault, so a changed form closes and loses what was typed.
  it('Esc on a changed form only resets it: the sheet stays', async () => {
    renderCatalog([ENVENENADO]);
    const sheet = await openEditor('Envenenado');
    await userEvent.type(within(sheet).getByLabelText('Descrição'), ' Muito.{Escape}');
    expect(editorSheet('Editar Envenenado')).toBeInTheDocument();
    expect(within(sheet).getByLabelText('Descrição')).toHaveValue('Desvantagem.');
  });

  it('"Fechar" closes the sheet without a command', async () => {
    const { commands } = renderCatalog([ENVENENADO]);
    const sheet = await openEditor('Envenenado');
    await userEvent.click(within(sheet).getByRole('button', { name: 'Fechar' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(commands.sent).toEqual([]);
  });

  it('closing drops what was typed: reopened, the form is at the saved values', async () => {
    renderCatalog([ENVENENADO]);
    const sheet = await openEditor('Envenenado');
    await userEvent.type(within(sheet).getByLabelText('Nome'), ' forte');
    await userEvent.click(within(sheet).getByRole('button', { name: 'Fechar' }));
    const reopened = await openEditor('Envenenado');
    expect(within(reopened).getByLabelText('Nome')).toHaveValue('Envenenado');
  });
});

describe('ConditionEditorSheet (new)', () => {
  it('"Nova condição" opens an empty form, the name focused', async () => {
    renderCatalog([CAIDO]);
    const sheet = await openNew();
    expect(within(sheet).getByRole('form', { name: 'Nova condição' })).toBeInTheDocument();
    expect(within(sheet).getByLabelText('Nome')).toHaveValue('');
    expect(within(sheet).getByLabelText('Nome')).toHaveFocus();
  });

  it('"Criar condição" sends one condition:define with the description, not stacking by default', async () => {
    const { commands } = renderCatalog([CAIDO]);
    const sheet = await openNew();
    await userEvent.type(within(sheet).getByLabelText('Nome'), 'Sangrando');
    await userEvent.type(within(sheet).getByLabelText('Descrição'), 'Perde 1 PV por rodada.');
    await userEvent.click(within(sheet).getByRole('button', { name: 'Criar condição' }));
    expect(commands.sentAs('defineCondition').map(({ fields }) => fields)).toEqual([
      {
        name: 'Sangrando',
        tone: 'harm',
        icon: 'circle-dot',
        look: null,
        description: 'Perde 1 PV por rodada.',
        maxStacks: null,
        color: null,
        imageAssetId: null,
      },
    ]);
  });

  it('once created, the sheet switches to the editor of the new condition', async () => {
    const { commands, confirm } = renderCatalog([CAIDO]);
    const sheet = await openNew();
    await userEvent.type(within(sheet).getByLabelText('Nome'), 'Sangrando');
    commands.hold();
    await userEvent.click(within(sheet).getByRole('button', { name: 'Criar condição' }));
    const sangrando = conditionDefinition({ id: 'def-new', name: 'Sangrando' });
    confirm({ type: 'conditionDefined', payload: { definition: sangrando } });
    await act(async () => commands.release());
    const editor = editorSheet('Editar Sangrando');
    expect(within(editor).getByRole('form', { name: 'Sangrando' })).toBeInTheDocument();
    expect(within(editor).getByLabelText('Nome')).toHaveValue('Sangrando');
  });

  it('a refused creation keeps the new form with what was typed', async () => {
    const { commands } = renderCatalog([CAIDO]);
    commands.answerWith({ ok: false, failure: 'name_taken' });
    const sheet = await openNew();
    await userEvent.type(within(sheet).getByLabelText('Nome'), 'Caído');
    await userEvent.click(within(sheet).getByRole('button', { name: 'Criar condição' }));
    const kept = editorSheet('Nova condição');
    expect(kept).toHaveTextContent('Já há uma condição com esse nome.');
    expect(within(kept).getByLabelText('Nome')).toHaveValue('Caído');
  });

  it('"Cancelar" closes the sheet without a command', async () => {
    const { commands } = renderCatalog([CAIDO]);
    const sheet = await openNew();
    await userEvent.click(within(sheet).getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(commands.sent).toEqual([]);
  });

  it('Esc, even after typing, closes the sheet without a command', async () => {
    const { commands } = renderCatalog([CAIDO]);
    const sheet = await openNew();
    await userEvent.type(within(sheet).getByLabelText('Nome'), 'x{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(commands.sent).toEqual([]);
  });
});
