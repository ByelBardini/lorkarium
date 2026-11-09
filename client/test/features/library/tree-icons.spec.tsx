import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HiddenItemSeal, TreeFolderIcon } from '@/features/library/tree-icons';

describe('TreeFolderIcon', () => {
  it('fills the folder with the color of the row', () => {
    const { container } = render(<TreeFolderIcon open={false} />);
    expect(container.querySelector('svg')).toHaveAttribute('fill', 'currentColor');
  });

  it('draws a closed folder in one piece and an open one with its front flap', () => {
    const closed = render(<TreeFolderIcon open={false} />);
    expect(closed.container.querySelectorAll('path')).toHaveLength(1);
    const open = render(<TreeFolderIcon open />);
    expect(open.container.querySelectorAll('path')).toHaveLength(2);
  });
});

describe('HiddenItemSeal', () => {
  function renderSealedIcon(): HTMLElement {
    const { container } = render(
      <HiddenItemSeal>
        <svg data-testid="item-icon" />
      </HiddenItemSeal>,
    );
    return container;
  }

  it('fades the item icon', () => {
    const faded = renderSealedIcon().querySelector('[data-hidden-item-icon]');
    expect(faded).toHaveClass('opacity-50');
    expect(faded?.querySelector('[data-testid="item-icon"]')).not.toBeNull();
  });

  it('keeps the crossed-out eye out of the fade', () => {
    const container = renderSealedIcon();
    const eye = container.querySelector('[data-hidden-item-seal] svg.lucide-eye-off');
    expect(eye).not.toBeNull();
    expect(eye?.closest('[data-hidden-item-icon]')).toBeNull();
  });
});
