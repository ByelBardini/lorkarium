import { SHEET_TEMPLATE_SOURCE_MAX_BYTES } from '@lorkarium/contracts';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SheetTemplateEditor } from '@/features/sheets/sheet-template-editor';
import { readSheetTemplateFile } from '@/lib/sheet-template-file';
import { createSheetTemplateDraftStore } from '@/stores/sheet-template-draft-store';
import { VHARN } from '../../support/campaigns-api-fake';
import { codeTextOf, replaceCode } from '../../support/code-editor-input';
import { FileDownloadFake } from '../../support/file-download-fake';
import { TORMENTA_TEMPLATE_ID } from '../../support/sheet-fixtures';
import { SheetChannelsFake } from '../../support/sheet-frame-fakes';
import { tormentaTemplate } from '../../support/sheet-template-fixtures';
import { SheetTemplatesApiFake } from '../../support/sheet-templates-api-fake';

let api: SheetTemplatesApiFake;
let channels: SheetChannelsFake;
let fileDownload: FileDownloadFake;

beforeEach(() => {
  api = new SheetTemplatesApiFake();
  channels = new SheetChannelsFake();
  fileDownload = new FileDownloadFake();
});

function tormentaDraft() {
  return createSheetTemplateDraftStore({
    api,
    campaignId: VHARN.id,
    templateId: TORMENTA_TEMPLATE_ID,
  });
}

async function openTormenta(live = true) {
  const user = userEvent.setup();
  render(
    <SheetTemplateEditor draft={tormentaDraft()} live={live} createChannel={channels.create} />,
  );
  await screen.findByRole('textbox', { name: 'HTML do modelo' });
  return user;
}

async function showCode(user: ReturnType<typeof userEvent.setup>, title: 'HTML' | 'CSS' | 'JS') {
  await user.click(screen.getByRole('tab', { name: title }));
  return screen.findByRole('textbox', { name: `${title} do modelo` });
}

async function openTormentaWithExport() {
  const user = userEvent.setup();
  render(
    <SheetTemplateEditor
      draft={tormentaDraft()}
      live
      exportPorts={{ api, fileDownload, campaignId: VHARN.id }}
    />,
  );
  await screen.findByRole('textbox', { name: 'HTML do modelo' });
  return user;
}

function exportedJs(): string | null {
  const reading = readSheetTemplateFile(fileDownload.saves[0]?.text ?? '');
  return reading.ok ? reading.template.js : null;
}

function saveButton(): HTMLElement {
  return screen.getByRole('button', { name: 'Salvar' });
}

describe('SheetTemplateEditor', () => {
  it('loads the template: name and the HTML first', async () => {
    await openTormenta();
    expect(screen.getByRole('textbox', { name: 'Nome do modelo' })).toHaveValue('Ficha Tormenta');
    expect(codeTextOf('HTML do modelo')).toBe('<p id="pv">PV</p>');
  });

  it('switching between HTML, CSS and JS keeps the text of each one', async () => {
    const user = await openTormenta();
    replaceCode('HTML do modelo', '<p>Força</p>');
    await showCode(user, 'CSS');
    replaceCode('CSS do modelo', 'p { color: gold; }');
    await showCode(user, 'JS');
    expect(codeTextOf('JS do modelo')).toBe('lorkarium.ready();');
    await showCode(user, 'HTML');
    expect(codeTextOf('HTML do modelo')).toBe('<p>Força</p>');
    await showCode(user, 'CSS');
    expect(codeTextOf('CSS do modelo')).toBe('p { color: gold; }');
  });

  it('saving sends the three sources and the name against the version read', async () => {
    const user = await openTormenta();
    replaceCode('HTML do modelo', '<p>Força</p>');
    await user.clear(screen.getByRole('textbox', { name: 'Nome do modelo' }));
    await user.type(screen.getByRole('textbox', { name: 'Nome do modelo' }), 'Ficha T20');
    await user.click(saveButton());
    expect(api.updates.map(({ input }) => input)).toEqual([
      {
        expectedVersion: 3,
        name: 'Ficha T20',
        html: '<p>Força</p>',
        css: 'p { color: red; }',
        js: 'lorkarium.ready();',
      },
    ]);
    expect(await screen.findByText('Salvo.')).toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
  });

  it('nothing changed: save is disabled', async () => {
    await openTormenta();
    expect(saveButton()).toBeDisabled();
  });

  it('reconnecting: save is disabled even with changes', async () => {
    await openTormenta(false);
    replaceCode('HTML do modelo', '<p>Força</p>');
    expect(saveButton()).toBeDisabled();
  });

  it('the preview gets a sample state: token "Exemplo", PV 20/20', async () => {
    await openTormenta();
    const frame = screen.getByTitle('Prévia da ficha') as HTMLIFrameElement;
    vi.spyOn(frame.contentWindow as Window, 'postMessage').mockImplementation(() => undefined);
    fireEvent.load(frame);
    const host = channels.created[0]?.port1;
    host?.dispatchEvent(new MessageEvent('message', { data: { type: 'ready', requestId: '1' } }));
    expect(host?.sent).toContainEqual(
      expect.objectContaining({
        type: 'state',
        token: { name: 'Exemplo', image: null },
        bars: [expect.objectContaining({ label: 'PV', current: 20, max: 20 })],
        canEdit: true,
      }),
    );
  });

  it('a request of the preview never becomes a real command: a roll says it is a preview', async () => {
    await openTormenta();
    const frame = screen.getByTitle('Prévia da ficha') as HTMLIFrameElement;
    vi.spyOn(frame.contentWindow as Window, 'postMessage').mockImplementation(() => undefined);
    fireEvent.load(frame);
    const host = channels.created[0]?.port1;
    const roll = { type: 'dice.roll', requestId: '1', expression: '1d20' };
    host?.dispatchEvent(new MessageEvent('message', { data: roll }));
    expect(host?.sent).toEqual([expect.objectContaining({ type: 'error', code: 'PREVIEW_ONLY' })]);
  });

  it('past 512 KiB the size turns red and save is disabled', async () => {
    const user = await openTormenta();
    const { html, css } = tormentaTemplate();
    const fill = SHEET_TEMPLATE_SOURCE_MAX_BYTES - html.length - css.length + 1;
    await showCode(user, 'JS');
    replaceCode('JS do modelo', 'x'.repeat(fill));
    const size = screen.getByLabelText('Tamanho do código');
    expect(size).toHaveAttribute('data-over-budget', 'true');
    expect(size).toHaveClass('text-destructive-text');
    expect(saveButton()).toBeDisabled();
    expect(screen.getByText('Grande demais para salvar.')).toBeInTheDocument();
  });

  it('exactly 512 KiB still saves', async () => {
    const user = await openTormenta();
    const { html, css } = tormentaTemplate();
    await showCode(user, 'JS');
    replaceCode(
      'JS do modelo',
      'x'.repeat(SHEET_TEMPLATE_SOURCE_MAX_BYTES - html.length - css.length),
    );
    expect(screen.getByLabelText('Tamanho do código')).toHaveAttribute('data-over-budget', 'false');
    expect(saveButton()).toBeEnabled();
  });

  it('another master saved: "Carregar versão atual" shows it and keeps my text to put back', async () => {
    const user = await openTormenta();
    api.templates.set(TORMENTA_TEMPLATE_ID, tormentaTemplate({ version: 4, html: '<p>dele</p>' }));
    replaceCode('HTML do modelo', '<p>meu</p>');
    await user.click(saveButton());
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Outro mestre salvou');
    await user.click(within(alert).getByRole('button', { name: 'Carregar versão atual' }));
    await waitFor(() => expect(codeTextOf('HTML do modelo')).toBe('<p>dele</p>'));
    await user.click(screen.getByRole('button', { name: 'Voltar ao meu texto' }));
    expect(codeTextOf('HTML do modelo')).toBe('<p>meu</p>');
    await user.click(saveButton());
    expect(api.updates.at(-1)?.input).toMatchObject({ expectedVersion: 4, html: '<p>meu</p>' });
  });

  it('a template that cannot be read shows the reason and "Tentar de novo"', async () => {
    api.detailResult = { ok: false, failure: { kind: 'offline' } };
    const user = userEvent.setup();
    render(<SheetTemplateEditor draft={tormentaDraft()} live />);
    expect(await screen.findByText(/Sem conexão/)).toBeInTheDocument();
    api.detailResult = null;
    await user.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByRole('textbox', { name: 'HTML do modelo' })).toBeInTheDocument();
  });

  it('shows only the moves offered: "Abrir modelo em aba", "… em janela", "Fechar modelo"', async () => {
    const opened: string[] = [];
    const user = userEvent.setup();
    render(
      <SheetTemplateEditor
        draft={tormentaDraft()}
        live
        moves={{ openTab: () => opened.push('tab'), close: () => opened.push('close') }}
      />,
    );
    await user.click(await screen.findByRole('button', { name: 'Abrir modelo em aba' }));
    await user.click(screen.getByRole('button', { name: 'Fechar modelo' }));
    expect(screen.queryByRole('button', { name: 'Abrir modelo em janela' })).toBeNull();
    expect(opened).toEqual(['tab', 'close']);
  });

  describe('"Exportar modelo"', () => {
    const UNSAVED_NOTE = 'Exporta a versão salva; salve antes para levar o que mudou';

    it('a clean editor downloads the saved version, with no note about unsaved code', async () => {
      const user = await openTormentaWithExport();
      const button = screen.getByRole('button', { name: 'Exportar modelo' });
      expect(button).not.toHaveAccessibleDescription(UNSAVED_NOTE);
      await user.click(button);
      await waitFor(() => expect(fileDownload.saves).toHaveLength(1));
      expect(api.detailCalls.at(-1)).toBe(TORMENTA_TEMPLATE_ID);
      expect(fileDownload.saves[0]).toMatchObject({
        fileName: 'Ficha Tormenta.lksheet',
        type: 'application/json',
      });
      expect(exportedJs()).toBe(tormentaTemplate().js);
    });

    it('with JS typed and not saved it says so, and the file carries the server JS', async () => {
      const user = await openTormentaWithExport();
      await showCode(user, 'JS');
      replaceCode('JS do modelo', 'lorkarium.onState(() => {});');
      const button = screen.getByRole('button', { name: 'Exportar modelo' });
      expect(button).toHaveAccessibleDescription(UNSAVED_NOTE);
      await user.click(button);
      await waitFor(() => expect(fileDownload.saves).toHaveLength(1));
      expect(exportedJs()).toBe('lorkarium.ready();');
    });

    it('without the export ports there is no button', async () => {
      await openTormenta();
      expect(screen.queryByRole('button', { name: 'Exportar modelo' })).toBeNull();
    });
  });

  it('the API tab lists the five SDK calls and the limits', async () => {
    const user = await openTormenta();
    await user.click(screen.getByRole('tab', { name: 'API' }));
    for (const call of ['ready', 'onState', 'values.set', 'bars.adjust', 'dice.roll'])
      expect(
        screen.getByText(new RegExp(`lorkarium\\.${call.replace('.', '\\.')}\\(`, 'u'), {
          selector: 'dt',
        }),
      ).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Limites da ficha' })).toHaveTextContent('512 KiB');
  });
});
