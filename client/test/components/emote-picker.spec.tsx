import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { EmotePicker } from '@/components/emote-picker';
import { CustomEmojisContext } from '@/components/custom-emojis/use-custom-emojis-store';
import { createCustomEmojisStore } from '@/stores/custom-emojis-store';
import { CustomEmojisApiFake } from '../support/custom-emojis-api-fake';

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
  it('opens on the Reações tab, one tab per category', async () => {
    const { panel } = await openPicker();
    const tabs = within(panel).getAllByRole('tab');
    expect(tabs.map((tab) => tab.getAttribute('aria-label'))).toEqual([
      'Reações',
      'Gestos',
      'RPG',
      'Símbolos',
      'Memes',
    ]);
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
    expect(within(panel).getByRole('button', { name: '=)' })).toBeInTheDocument();
  });

  it('the RPG tab shows the dice and not the reactions', async () => {
    const { panel } = await openPicker();
    await userEvent.click(within(panel).getByRole('tab', { name: 'RPG' }));
    const rpg = within(screen.getByRole('tabpanel'));
    expect(rpg.getByRole('button', { name: ':dice:' })).toBeInTheDocument();
    expect(rpg.queryByRole('button', { name: ':joy:' })).toBeNull();
  });

  it('the Memes tab shows the 11 memes', async () => {
    const { panel } = await openPicker();
    await userEvent.click(within(panel).getByRole('tab', { name: 'Memes' }));
    expect(within(screen.getByRole('tabpanel')).getAllByRole('button')).toHaveLength(11);
  });

  it('moves between tabs with the arrow keys', async () => {
    const { panel } = await openPicker();
    within(panel).getByRole('tab', { name: 'Reações' }).focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(within(panel).getByRole('tab', { name: 'Gestos' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('the monkeys are in the Reações tab, with no tab of their own', async () => {
    const { panel } = await openPicker();
    expect(within(panel).queryByRole('tab', { name: 'Macacos' })).toBeNull();
    const reactions = within(screen.getByRole('tabpanel'));
    expect(reactions.getByRole('button', { name: ':see_no_evil:' })).toBeInTheDocument();
    expect(reactions.getByRole('button', { name: ':orangutan:' })).toBeInTheDocument();
  });

  it('a click gives the first code and keeps the grid open for the next one', async () => {
    const { picked, panel } = await openPicker();
    await userEvent.click(within(panel).getByRole('button', { name: '=)' }));
    await userEvent.click(within(panel).getByRole('button', { name: ':joy:' }));
    expect(picked.codes).toEqual(['=)', ':joy:']);
    expect(screen.getByRole('dialog', { name: 'Memes e smileys' })).toBeInTheDocument();
  });

  it('the search looks across every tab by code or name, and says when nothing matches', async () => {
    const { panel } = await openPicker();
    const search = within(panel).getByRole('searchbox', { name: 'Buscar meme ou smiley' });
    await userEvent.type(search, 'dado');
    expect(
      within(panel)
        .getAllByRole('button')
        .map((each) => each.getAttribute('aria-label')),
    ).toEqual([':dice:']);
    await userEvent.clear(search);
    await userEvent.type(search, 'xyzw');
    expect(within(panel).getByText('Nada encontrado.')).toBeInTheDocument();
  });

  it('disabled, the button does not open', () => {
    render(<EmotePicker onPick={() => undefined} disabled />);
    expect(screen.getByRole('button', { name: 'Memes e smileys' })).toBeDisabled();
  });

  describe('with emojis of the account', () => {
    async function openWithOwn(): Promise<{ picked: PickedCodes; panel: HTMLElement }> {
      const api = new CustomEmojisApiFake().with('festa', 'velho');
      api.limit = 1;
      const store = createCustomEmojisStore(api);
      await store.getState().load();
      const picked = new PickedCodes();
      render(
        <CustomEmojisContext value={store}>
          <EmotePicker onPick={picked.onPick} />
        </CustomEmojisContext>,
      );
      await userEvent.click(screen.getByRole('button', { name: 'Memes e smileys' }));
      return { picked, panel: screen.getByRole('dialog', { name: 'Memes e smileys' }) };
    }

    it('opens on "Meus emojis" with only the active ones, and a click gives the :name:', async () => {
      const { picked, panel } = await openWithOwn();

      expect(within(panel).getByRole('tab', { name: 'Meus emojis' })).toHaveAttribute(
        'aria-selected',
        'true',
      );
      const mine = within(screen.getByRole('tabpanel')).getAllByRole('button');
      expect(mine.map((each) => each.getAttribute('aria-label'))).toEqual([':festa:']);
      await userEvent.click(mine[0]!);
      expect(picked.codes).toEqual([':festa:']);
    });

    it('the search finds the own emoji by name too', async () => {
      const { panel } = await openWithOwn();

      await userEvent.type(within(panel).getByRole('searchbox'), 'fest');

      expect(within(panel).getByRole('button', { name: ':festa:' })).toBeInTheDocument();
    });
  });
});
