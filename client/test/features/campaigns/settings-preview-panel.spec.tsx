import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { SettingsPreviewPanel } from '@/features/campaigns/settings-preview-panel';
import type { SettingsValues } from '@/features/campaigns/use-campaign-settings-draft';

const PHOTO_ID = '1b2c3d4e-5f60-4a71-8b92-a3b4c5d6e7f8';
const BANNER_ID = '3d4e5f60-7182-4c93-8da4-c5d6e7f8091a';

const VALUES: SettingsValues = {
  name: 'Os Sinos de Vharn',
  system: 'D&D 5e',
  status: 'recruiting',
  description: 'Um sino toca sozinho na torre de Vharn.',
  visibility: 'public',
  contentWarnings: [],
  tags: ['Investigação'],
  cover: { kind: 'drawn', drawing: 2, tone: 1 },
  photoAssetId: null,
  bannerAssetId: null,
  requirePassword: false,
  password: '',
  playersCreateTokens: false,
  playersDeleteTokens: false,
};

const CAMPAIGN = { ownerId: 'owner-1', masterName: 'Ana', memberCount: 3 } as const;

function renderPanel(values: Partial<SettingsValues> = {}): void {
  render(<SettingsPreviewPanel values={{ ...VALUES, ...values }} campaign={CAMPAIGN} />);
}

function panel(name: string): HTMLElement {
  return screen.getByRole('tabpanel', { name });
}

describe('SettingsPreviewPanel · where the table appears', () => {
  it('offers Início, Explorar and Trilho, Início first', () => {
    renderPanel();
    const tabs = screen.getAllByRole('tab').map((tab) => tab.textContent);
    expect(tabs).toEqual(['Início', 'Explorar', 'Trilho']);
    expect(screen.getByRole('tab', { name: 'Início' })).toHaveAttribute('aria-selected', 'true');
  });

  it('Início: without a banner the "Continuar" band shows the cover drawing', () => {
    renderPanel();
    const band = within(panel('Início')).getByRole('group', { name: 'Continuar' });
    expect(band.querySelector('[data-cover-drawing="2"]')).not.toBeNull();
    expect(band).toHaveTextContent('Os Sinos de Vharn');
  });

  it('Início: the banner and the photo go where the home shows them', () => {
    renderPanel({ bannerAssetId: BANNER_ID, photoAssetId: PHOTO_ID });
    const home = panel('Início');
    const band = within(home).getByRole('group', { name: 'Continuar' });
    const row = within(home).getByRole('group', { name: 'Suas mesas' });
    expect(band.querySelector('img')).toHaveAttribute('src', `/api/assets/${BANNER_ID}`);
    expect(row.querySelector('img')).toHaveAttribute('src', `/api/assets/${PHOTO_ID}`);
  });

  it('the meta is what the others read: system, master and members', () => {
    renderPanel();
    expect(panel('Início')).toHaveTextContent('D&D 5e · Mestre: Ana · 3 participantes');
  });

  it('a blank name reads "Mesa sem nome"', () => {
    renderPanel({ name: '   ' });
    expect(panel('Início')).toHaveTextContent('Mesa sem nome');
  });

  it('Explorar: a public table shows its card', async () => {
    renderPanel();
    await userEvent.click(screen.getByRole('tab', { name: 'Explorar' }));
    expect(panel('Explorar')).toHaveTextContent('Os Sinos de Vharn');
    expect(panel('Explorar')).not.toHaveTextContent('não aparece em Explorar');
  });

  it('Explorar: a private table says it does not show there', async () => {
    renderPanel({ visibility: 'private' });
    await userEvent.click(screen.getByRole('tab', { name: 'Explorar' }));
    expect(panel('Explorar')).toHaveTextContent('Privada: não aparece em Explorar.');
  });

  it('Trilho: the photo of the open table', async () => {
    renderPanel({ photoAssetId: PHOTO_ID });
    await userEvent.click(screen.getByRole('tab', { name: 'Trilho' }));
    expect(panel('Trilho').querySelector('img')).toHaveAttribute('src', `/api/assets/${PHOTO_ID}`);
  });
});

describe('SettingsPreviewPanel · ready to receive people', () => {
  it('counts the items done and shows the progress', () => {
    renderPanel();
    const ready = screen.getByRole('region', { name: 'Pronta pra receber gente' });
    expect(ready).toHaveTextContent('2 de 4');
    expect(within(ready).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '2');
  });

  it('each item says, in words, whether it is done', () => {
    renderPanel();
    const ready = screen.getByRole('region', { name: 'Pronta pra receber gente' });
    expect(within(ready).getByRole('button', { name: 'Nome' })).toHaveAccessibleDescription(
      'Feito',
    );
    expect(
      within(ready).getByRole('button', { name: 'Capa com imagem' }),
    ).toHaveAccessibleDescription('Falta, em Imagens');
  });

  it('an item jumps to its section of the page, moving the focus there', async () => {
    render(
      <div data-settings-scroller>
        <SettingsPreviewPanel values={VALUES} campaign={CAMPAIGN} />
        <section id="settings-images" tabIndex={-1} aria-label="Imagens" />
      </div>,
    );
    const ready = screen.getByRole('region', { name: 'Pronta pra receber gente' });
    await userEvent.click(within(ready).getByRole('button', { name: 'Capa com imagem' }));
    expect(screen.getByRole('region', { name: 'Imagens' })).toHaveFocus();
  });
});
