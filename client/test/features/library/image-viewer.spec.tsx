import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ImageViewerModal } from '@/features/library/image-viewer';
import { PORTRAIT } from '../../support/library-fixtures';

describe('image viewer', () => {
  it('shows the entire portrait and reports loading until the image finishes', () => {
    render(<ImageViewerModal image={PORTRAIT} onClose={() => undefined} />);
    expect(screen.getByRole('dialog', { name: 'Retrato' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Carregando imagem');
    const image = screen.getByRole('img', { name: 'Retrato' });
    expect(image).toHaveClass('object-contain');
    fireEvent.load(image);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
  it('a failed image provides a fresh attempt without closing the preview', async () => {
    render(<ImageViewerModal image={PORTRAIT} onClose={() => undefined} />);
    fireEvent.error(screen.getByRole('img'));
    expect(screen.getByRole('alert')).toHaveTextContent('Não deu para carregar');
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(screen.getByRole('img')).toHaveAttribute(
      'src',
      `/api/assets/${PORTRAIT.asset.id}?retry=1`,
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
  it('Escape closes locally while showing the image does not invoke dismissal', async () => {
    const dismiss = vi.fn();
    render(<ImageViewerModal image={PORTRAIT} onClose={dismiss} />);
    expect(dismiss).toHaveBeenCalledTimes(0);
    await userEvent.keyboard('{Escape}');
    expect(dismiss).toHaveBeenCalledTimes(1);
  });
});
