import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TokenFace } from '@/features/tokens/token-face';
import { LYRA_PORTRAIT } from '../../support/assets-api-fake';

describe('TokenFace', () => {
  it('a token with an image shows it', () => {
    render(<TokenFace initials="LY" imageAssetId={LYRA_PORTRAIT.id} round alt="Lyra" />);

    expect(screen.getByRole('img', { name: 'Lyra' })).toHaveAttribute(
      'src',
      `/api/assets/${LYRA_PORTRAIT.id}`,
    );
  });

  it('a token without an image shows its initials', () => {
    render(<TokenFace initials="LY" imageAssetId={null} round />);

    expect(screen.getByText('LY')).toBeInTheDocument();
  });

  it('an image that fails to load falls back to the initials, as on the board', () => {
    render(<TokenFace initials="LY" imageAssetId={LYRA_PORTRAIT.id} round alt="Lyra" />);

    fireEvent.error(screen.getByRole('img', { name: 'Lyra' }));

    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText('LY')).toBeInTheDocument();
  });
});
