import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CampaignDetailDto } from '@lorkarium/contracts';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { buildRoutes } from '@/app/router';
import type { TestDependencies } from './app-dependencies';
import { detailOf, VHARN } from './campaigns-api-fake';
import { vharnBoard, vharnState } from './table-session-fixtures';

export const SETTINGS_ROOM_PATH = `/campaigns/${VHARN.id}/table`;
export const SETTINGS_PAGE_PATH = `${SETTINGS_ROOM_PATH}/settings`;

/** The whole router over `testDependencies()`, opened on VHARN's live room as the master and
 *  then on its "Configurações da mesa" page.
 *
 *  Example: `const form = await new CampaignSettingsHarness(deps).open({ hasPassword: true })` */
export class CampaignSettingsHarness {
  router: ReturnType<typeof createMemoryRouter> | null = null;

  constructor(private readonly deps: TestDependencies) {}

  renderAt(path: string): void {
    this.router = createMemoryRouter(buildRoutes(this.deps), { initialEntries: [path] });
    render(<RouterProvider router={this.router} />);
  }

  async open(overrides: Partial<CampaignDetailDto> = {}): Promise<HTMLElement> {
    this.deps.campaignsApi.answer('detail', { ok: true, value: detailOf(VHARN, overrides) });
    this.renderAt(SETTINGS_ROOM_PATH);
    await screen.findByRole('heading', { level: 1, name: VHARN.name });
    this.deps.tableSessionApi.emit(
      { kind: 'state', state: vharnState() },
      { kind: 'status', status: 'live' },
      { kind: 'board', state: vharnBoard() },
    );
    await act(() => Promise.resolve());
    await userEvent.click(screen.getByRole('link', { name: 'Configurações da mesa' }));
    return screen.findByRole('form', { name: 'Configurações da mesa' });
  }

  pathname(): string {
    if (!this.router) throw new Error('No router yet: expected renderAt(path) or open() first.');
    return this.router.state.location.pathname;
  }

  bar(): HTMLElement {
    return screen.getByRole('region', { name: 'Alterações da mesa' });
  }

  async save(): Promise<void> {
    await userEvent.click(within(this.bar()).getByRole('button', { name: 'Salvar alterações' }));
  }

  lastUpdateInput(): unknown {
    const calls = this.deps.campaignsApi.callsOf('update') as Array<{ input: unknown }>;
    return calls.at(-1)?.input;
  }
}
