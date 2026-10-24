import type { SessionMemberDto } from '@lorkarium/contracts';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { MemberCardPopover } from '@/features/sessions/member-card-popover';
import { BIA_AT_TABLE } from '../../support/table-session-fixtures';

const AVATAR_ID = '3c1b2a09-8f7e-4d6c-9b5a-4e3d2c1b0a99';
const BIA_WITH_BIO: SessionMemberDto = {
  ...BIA_AT_TABLE,
  bio: 'Barda de Vharn, toca alaúde.',
  avatarId: AVATAR_ID,
};

describe('MemberCardPopover', () => {
  async function openCardOf(member: SessionMemberDto = BIA_WITH_BIO): Promise<HTMLElement> {
    render(<MemberCardPopover member={member} />);
    await userEvent.click(screen.getByRole('button', { name: member.name }));
    return screen.findByRole('dialog', { name: `Cartão de ${member.name}` });
  }

  it('clicking the nickname opens the card with the avatar, the nickname, the @ and the bio', async () => {
    const card = await openCardOf();

    expect(within(card).getByTestId('avatar-photo')).toHaveAttribute(
      'src',
      `/api/avatars/${AVATAR_ID}`,
    );
    expect(card).toHaveTextContent('Bia');
    expect(card).toHaveTextContent('@bia');
    expect(card).toHaveTextContent('Barda de Vharn, toca alaúde.');
  });

  it('without a bio the card has no bio line, only the avatar, the nickname and the @', async () => {
    const card = await openCardOf({ ...BIA_AT_TABLE, bio: null });

    expect(card).toHaveTextContent('Bia@bia');
    expect(card.querySelector('p')).toBeNull();
  });

  it('the card is closed until the nickname is clicked', () => {
    render(<MemberCardPopover member={BIA_WITH_BIO} />);

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('Esc closes the card', async () => {
    await openCardOf();

    await userEvent.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
