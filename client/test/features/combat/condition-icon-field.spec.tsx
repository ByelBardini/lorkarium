import { CONDITION_ICONS, type ConditionIconDto } from '@lorkarium/contracts';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConditionIconField } from '@/features/combat/condition-icon-field';
import { ICON_GRID_BLOCK } from '@/features/combat/condition-icon-grid';
import { IntersectionObserverFake } from '../../support/intersection-observer-fake';

function Field({
  name = '',
  onChange,
}: Readonly<{ name?: string; onChange?: (icon: ConditionIconDto) => void }>) {
  const [icon, setIcon] = useState<ConditionIconDto>('circle-dot');
  return (
    <ConditionIconField
      value={icon}
      tone="harm"
      name={name}
      onChange={(next) => {
        setIcon(next);
        onChange?.(next);
      }}
    />
  );
}

async function opened(name = '', onChange?: (icon: ConditionIconDto) => void) {
  render(<Field name={name} onChange={onChange} />);
  await userEvent.click(screen.getByRole('button', { name: 'Ícone: Marca' }));
  return screen.getByRole('dialog', { name: 'Escolher ícone' });
}

const gridOf = (dialog: HTMLElement, name: string | RegExp) =>
  within(dialog).getByRole('group', { name });
const iconsIn = (group: HTMLElement) => within(group).getAllByRole('button');

beforeEach(() => {
  IntersectionObserverFake.reset();
  vi.stubGlobal('IntersectionObserver', IntersectionObserverFake);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ConditionIconField', () => {
  it('opens on the Game-icons tab with its 4.134 icons and the ones suggested for the name', async () => {
    const dialog = await opened('Imobilizado');

    const tab = within(dialog).getByRole('tab', { name: /Game-icons/ });
    expect(tab).toHaveAttribute('aria-selected', 'true');
    expect(tab).toHaveTextContent('4.134');
    const suggested = gridOf(dialog, 'Sugeridos para “Imobilizado”');
    expect(iconsIn(suggested)[0]).toHaveAccessibleName('Algemas');
  });

  it('typing a search filters every library, counts the results and hides the suggestions', async () => {
    const dialog = await opened('Imobilizado');

    await userEvent.type(within(dialog).getByRole('searchbox', { name: 'Buscar ícone' }), 'fogo');

    const results = gridOf(dialog, /resultados?$/);
    expect(within(dialog).getByText(/^\d+ resultados$/)).toBeInTheDocument();
    const keys = iconsIn(results).map((icon) => icon.dataset.icon);
    expect(keys).toEqual(expect.arrayContaining(['game-icons:fire', 'tabler:flame']));
    expect(within(dialog).queryByRole('group', { name: /Sugeridos/ })).toBeNull();
  });

  it('the Tabler tab shows only Tabler icons', async () => {
    const dialog = await opened();

    await userEvent.click(within(dialog).getByRole('tab', { name: /Tabler/ }));

    const icons = iconsIn(gridOf(dialog, 'Tabler'));
    expect(icons.length).toBeGreaterThan(10);
    expect(icons.every((icon) => icon.dataset.icon?.startsWith('tabler:'))).toBe(true);
  });

  it('clicking an icon picks it and closes the picker', async () => {
    const onChange = vi.fn<(icon: ConditionIconDto) => void>();
    const dialog = await opened('Imobilizado', onChange);

    await userEvent.click(
      within(gridOf(dialog, /Sugeridos/)).getByRole('button', { name: 'Algemas' }),
    );

    expect(onChange).toHaveBeenCalledWith('game-icons:manacles');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('button', { name: 'Ícone: Algemas' })).toBeInTheDocument();
  });

  it('the preview names the icon under the pointer or the focus, and the current one otherwise', async () => {
    const dialog = await opened('Imobilizado');
    const preview = within(dialog).getByRole('region', { name: 'Prévia no token' });
    expect(preview).toHaveTextContent('Marca');

    const manacles = within(gridOf(dialog, /Sugeridos/)).getByRole('button', { name: 'Algemas' });
    await userEvent.hover(manacles);
    expect(preview).toHaveTextContent('Algemas');
    await userEvent.unhover(manacles);
    expect(preview).toHaveTextContent('Marca');

    act(() => manacles.focus());
    expect(preview).toHaveTextContent('Algemas');
  });

  it('the grid shows one block and adds the next when its end comes into view', async () => {
    const dialog = await opened();
    const grid = gridOf(dialog, 'Game-icons');
    expect(iconsIn(grid)).toHaveLength(ICON_GRID_BLOCK);

    act(() => IntersectionObserverFake.scrollIntoView(within(dialog).getByTestId('icon-grid-end')));

    expect(iconsIn(grid)).toHaveLength(ICON_GRID_BLOCK * 2);
  });

  it('a search with no result says so', async () => {
    const dialog = await opened();

    await userEvent.type(within(dialog).getByRole('searchbox', { name: 'Buscar ícone' }), 'xyzzy');

    expect(within(dialog).getByText('Nada com “xyzzy”')).toBeInTheDocument();
  });

  it('Esc closes without changing the icon', async () => {
    const onChange = vi.fn<(icon: ConditionIconDto) => void>();
    await opened('', onChange);

    await userEvent.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Ícone: Marca' })).toBeInTheDocument();
  });

  it('credits Game-icons with a link', async () => {
    const dialog = await opened();

    expect(within(dialog).getByRole('link', { name: /game-icons\.net/ })).toHaveAttribute(
      'href',
      'https://game-icons.net',
    );
  });

  it('Tab reaches the search and the tabs, and the arrows walk the grid', async () => {
    const dialog = await opened();
    const search = within(dialog).getByRole('searchbox', { name: 'Buscar ícone' });
    expect(search).toHaveFocus();

    await userEvent.tab();
    expect(within(dialog).getByRole('tab', { name: /Game-icons/ })).toHaveFocus();
    await userEvent.tab();
    const [first, second] = iconsIn(gridOf(dialog, 'Game-icons'));
    expect(first).toHaveFocus();
    await userEvent.keyboard('{ArrowRight}');
    expect(second).toHaveFocus();
    await userEvent.keyboard('{ArrowLeft}');
    expect(first).toHaveFocus();
  });

  it('the Lucide tab holds the 28 icons of before', async () => {
    const dialog = await opened();

    await userEvent.click(within(dialog).getByRole('tab', { name: /Lucide/ }));

    const keys = iconsIn(gridOf(dialog, 'Lucide')).map((icon) => icon.dataset.icon);
    expect(keys).toEqual(expect.arrayContaining(CONDITION_ICONS.slice(0, 28)));
  });
});
