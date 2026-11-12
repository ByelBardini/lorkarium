import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { UserHandle } from '@/components/user-handle';

describe('UserHandle', () => {
  it('writes the @ and glues the seal symbol right after it', () => {
    const seal = {
      plan: 'narrador',
      admin: false,
      lorkariumOwner: false,
    } as const;
    render(<UserHandle username="bia" seal={seal} />);

    const handle = screen.getByText('@bia');
    const symbol = screen.getByRole('img', { name: 'Plano Narrador' });
    expect(handle.nextElementSibling).toBe(symbol);
  });

  it('a Grátis account without the mark shows the @ alone', () => {
    const seal = { plan: 'free', admin: false, lorkariumOwner: false } as const;
    render(<UserHandle username="caio" seal={seal} />);

    expect(screen.getByText('@caio')).toBeInTheDocument();
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('without the seal fields the @ goes alone', () => {
    render(<UserHandle username="duda" seal={null} />);

    expect(screen.getByText('@duda').parentElement?.children).toHaveLength(1);
  });
});
