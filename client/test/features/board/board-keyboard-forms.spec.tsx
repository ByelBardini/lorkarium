import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildRoutes } from '@/app/router';
import { testDependencies, type TestDependencies } from '../../support/app-dependencies';
import { ANA } from '../../support/auth-api-fake';
import { VHARN } from '../../support/campaigns-api-fake';
import {
  KAEL_ID,
  LYRA_ID,
  kael,
  vharnBoard,
  vharnState,
} from '../../support/table-session-fixtures';
import { WOLF_FORM_ID, shapeshiftingLyra } from '../../support/token-form-fixtures';

// Ana (the master): her 1 2 3 also pick the layer, so a switch must keep the layer as it was.
describe('board keyboard, the keys 1–8 of the forms', () => {
  let deps: TestDependencies;

  beforeEach(async () => {
    deps = testDependencies();
    deps.authApi.answerMeWith(ANA);
    const router = createMemoryRouter(buildRoutes(deps), {
      initialEntries: [`/campaigns/${VHARN.id}/table`],
    });
    render(<RouterProvider router={router} />);
    await screen.findByRole('heading', { level: 1 });
    deps.tableSessionApi.emit(
      { kind: 'state', state: vharnState() },
      { kind: 'status', status: 'live' },
      { kind: 'board', state: vharnBoard({ tokens: [shapeshiftingLyra(), kael()] }) },
    );
    await act(() => Promise.resolve());
    screen.getByRole('application').focus();
  });

  function pick(...tokenIds: string[]): void {
    const renderer = deps.boardRenderers.latest();
    act(() => renderer.emit({ kind: 'tokensMarqueed', tokenIds, additive: false }));
  }

  function formSwitches(): unknown[] {
    return deps.boardCommands.sentAs('setTokenForm').map(({ fields }) => fields);
  }

  function layerButton(name: string): HTMLElement {
    return screen.getByRole('button', { name });
  }

  it('2 with Lyra selected switches her to the second form and keeps the layer', async () => {
    pick(LYRA_ID);

    await userEvent.keyboard('2');

    expect(formSwitches()).toEqual([{ tokenId: LYRA_ID, formId: WOLF_FORM_ID }]);
    expect(layerButton('Tokens (1)')).toHaveAttribute('aria-pressed', 'true');
  });

  it('with two tokens selected a digit switches no form', async () => {
    pick(LYRA_ID, KAEL_ID);

    await userEvent.keyboard('2');

    expect(formSwitches()).toEqual([]);
  });

  it.each([
    ['9, past the eight keys', '9'],
    ['4, a form Lyra does not have', '4'],
  ])('%s switches no form', async (_case, key) => {
    pick(LYRA_ID);

    await userEvent.keyboard(key);

    expect(formSwitches()).toEqual([]);
  });

  it('a digit typed in a text field switches no form', async () => {
    pick(LYRA_ID);
    const field = document.createElement('input');
    document.body.append(field);
    field.focus();

    await userEvent.keyboard('2');

    expect(formSwitches()).toEqual([]);
    field.remove();
  });

  it('a token without forms leaves the master her layer key: 2 picks Objetos', async () => {
    pick(KAEL_ID);

    await userEvent.keyboard('2');

    expect(formSwitches()).toEqual([]);
    expect(layerButton('Objetos (2)')).toHaveAttribute('aria-pressed', 'true');
  });
});
