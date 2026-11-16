import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { EmotePicker } from '@/components/emote-picker';

class PickedCodes {
  readonly codes: string[] = [];
  readonly onPick = (code: string): void => {
    this.codes.push(code);
  };
}

async function openPicker(): Promise<{ picked: PickedCodes; panel: HTMLElement }> {
  const picked = new PickedCodes();
  render(<EmotePicker onPick={picked.onPick} />);
  await userEvent.click(screen.getByRole('button', { name: 'Memes e smileys' }));
  return { picked, panel: screen.getByRole('dialog', { name: 'Memes e smileys' }) };
}

describe('EmotePicker', () => {
  it('opens on the smileys, and the Memes tab shows the 22 memes', async () => {
    const { panel } = await openPicker();
    expect(within(panel).getByRole('button', { name: '=)' })).toBeInTheDocument();
    await userEvent.click(within(panel).getByRole('tab', { name: 'Memes' }));
    const memes = within(screen.getByRole('tabpanel')).getAllByRole('button');
    expect(memes).toHaveLength(22);
  });

  it('a click gives the first code and closes the grid', async () => {
    const { picked, panel } = await openPicker();
    await userEvent.click(within(panel).getByRole('button', { name: '<3' }));
    expect(picked.codes).toEqual(['<3']);
    expect(screen.queryByRole('dialog', { name: 'Memes e smileys' })).toBeNull();
  });

  it('the search looks across both tabs by code or name, and says when nothing matches', async () => {
    const { panel } = await openPicker();
    const search = within(panel).getByRole('searchbox', { name: 'Buscar meme ou smiley' });
    await userEvent.type(search, 'coração');
    expect(
      within(panel)
        .getAllByRole('button')
        .map((each) => each.getAttribute('aria-label')),
    ).toEqual(['<3']);
    await userEvent.clear(search);
    await userEvent.type(search, 'zzz');
    expect(within(panel).getByText('Nada encontrado.')).toBeInTheDocument();
  });

  it('disabled, the button does not open', () => {
    render(<EmotePicker onPick={() => undefined} disabled />);
    expect(screen.getByRole('button', { name: 'Memes e smileys' })).toBeDisabled();
  });
});
