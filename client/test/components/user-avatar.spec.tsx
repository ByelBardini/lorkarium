import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { UserAvatar } from '@/components/user-avatar';

const AVATAR_ID = '3c1b2a09-8f7e-4d6c-9b5a-4e3d2c1b0a99';

describe('UserAvatar', () => {
  it('with a photo shows the image read from /api/avatars/<id> with the alt it was given', () => {
    render(<UserAvatar name="Bia" color="moss" avatarId={AVATAR_ID} alt="Foto de Bia" />);

    expect(screen.getByRole('img', { name: 'Foto de Bia' })).toHaveAttribute(
      'src',
      `/api/avatars/${AVATAR_ID}`,
    );
  });

  it('without a photo shows the initials of the nickname over the member color', () => {
    render(<UserAvatar name="Ana Lima" color="gold" avatarId={null} />);

    const initials = screen.getByTestId('avatar-initials');
    expect(initials).toHaveTextContent('AL');
    expect(initials).toHaveStyle({ backgroundColor: '#e0b25c' });
    expect(screen.queryByTestId('avatar-photo')).toBeNull();
  });

  it('a photo that fails to load falls back to the initials, still named by the alt', () => {
    render(<UserAvatar name="Bia" color="rose" avatarId={AVATAR_ID} alt="Foto de Bia" />);

    fireEvent.error(screen.getByRole('img', { name: 'Foto de Bia' }));

    expect(screen.queryByTestId('avatar-photo')).toBeNull();
    expect(screen.getByRole('img', { name: 'Foto de Bia' })).toHaveTextContent('BI');
    expect(screen.getByTestId('avatar-initials')).toHaveStyle({ backgroundColor: '#e58fb4' });
  });

  it('beside a name (no alt) the initials stay out of the accessibility tree', () => {
    render(<UserAvatar name="Bia" color="moss" avatarId={null} />);

    expect(screen.getByTestId('avatar-initials')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('a new photo after a broken one is tried again', () => {
    const other = '9e8d7c6b-5a49-4382-9170-6f5e4d3c2b1a';
    const { rerender } = render(<UserAvatar name="Bia" color="moss" avatarId={AVATAR_ID} />);
    fireEvent.error(screen.getByTestId('avatar-photo'));

    rerender(<UserAvatar name="Bia" color="moss" avatarId={other} />);

    expect(screen.getByTestId('avatar-photo')).toHaveAttribute('src', `/api/avatars/${other}`);
  });
});
