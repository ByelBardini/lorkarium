import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EmoteText } from '@/components/emote-text';

describe('EmoteText', () => {
  it('draws each code as a picture named by the code, with the text around it', () => {
    const { container } = render(
      <p>
        <EmoteText text="rolem :troll: :)" />
      </p>,
    );
    expect(screen.getByRole('img', { name: ':troll:' })).toHaveClass('size-[1.75em]');
    expect(screen.getByRole('img', { name: ':)' })).toHaveClass('size-[1.375em]');
    expect(container.querySelector('p')).toHaveTextContent('rolem');
  });

  it('draws a message of only pictures at the sticker size', () => {
    render(<EmoteText text=":vish: :D" />);
    for (const image of screen.getAllByRole('img')) expect(image).toHaveClass('size-10');
  });

  it('keeps a text without codes as plain text', () => {
    const { container } = render(<EmoteText text="às 10:30" />);
    expect(container).toHaveTextContent('às 10:30');
    expect(screen.queryByRole('img')).toBeNull();
  });
});
