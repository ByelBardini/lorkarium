import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ProfileCardBadges } from '@/features/profile-card/profile-card-badges';
import { badgesOf, VETERANO_BADGE } from '../../support/profile-card-fixtures';

function badgeList(): HTMLElement {
  return screen.getByRole('list', { name: 'Insígnias' });
}

function veterano(): HTMLElement {
  return screen.getByRole('button', { name: 'Insígnia Veterano' });
}

describe('ProfileCardBadges', () => {
  it('three badges show three images in the order received, each a button named after it', () => {
    const badges = [VETERANO_BADGE, ...badgesOf(2)];
    render(<ProfileCardBadges badges={badges} />);

    const buttons = within(badgeList()).getAllByRole('button');
    expect(buttons.map((button) => button.getAttribute('aria-label'))).toEqual([
      'Insígnia Veterano',
      'Insígnia Insígnia 1',
      'Insígnia Insígnia 2',
    ]);
    expect(within(veterano()).getByRole('img')).toHaveAttribute(
      'src',
      `/api/badge-images/${VETERANO_BADGE.imageId}`,
    );
  });

  it('hovering a badge opens the tooltip with its name and description', async () => {
    render(<ProfileCardBadges badges={[VETERANO_BADGE]} />);

    await userEvent.hover(veterano());

    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip).toHaveTextContent('Veterano');
    expect(tooltip).toHaveTextContent('Jogou 100 sessões');
  });

  it('focusing a badge by the keyboard opens the tooltip, and Esc closes it', async () => {
    render(<ProfileCardBadges badges={[VETERANO_BADGE]} />);

    await userEvent.tab();
    expect(veterano()).toHaveFocus();
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Jogou 100 sessões');
    await userEvent.keyboard('{Escape}');

    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('a tap toggles the tooltip: the first opens it, the second closes it', async () => {
    render(<ProfileCardBadges badges={[VETERANO_BADGE]} />);

    await userEvent.pointer({ keys: '[TouchA]', target: veterano() });
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Jogou 100 sessões');
    await userEvent.pointer({ keys: '[TouchA]', target: veterano() });

    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('without badges the "Insígnias" block is not there', () => {
    const { container } = render(<ProfileCardBadges badges={[]} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('eight badges under a limit of six show six and "+2"', () => {
    render(<ProfileCardBadges badges={badgesOf(8)} limit={6} />);

    expect(within(badgeList()).getAllByRole('button')).toHaveLength(6);
    expect(badgeList()).toHaveTextContent('+2');
    expect(within(badgeList()).getByText('e mais 2 insígnias')).toBeInTheDocument();
  });

  it('exactly six badges under a limit of six show no "+"', () => {
    render(<ProfileCardBadges badges={badgesOf(6)} limit={6} />);

    expect(within(badgeList()).getAllByRole('button')).toHaveLength(6);
    expect(badgeList()).not.toHaveTextContent('+');
  });

  it('an image that fails to load shows the name in its place, the row stays', () => {
    render(<ProfileCardBadges badges={[VETERANO_BADGE, ...badgesOf(1)]} />);

    fireEvent.error(within(veterano()).getByRole('img'));

    expect(within(veterano()).queryByRole('img')).toBeNull();
    expect(veterano()).toHaveTextContent('Veterano');
    expect(within(badgeList()).getAllByRole('button')).toHaveLength(2);
  });
});
