import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { FormCard, type FormCardProps } from '@/features/tokens/form-card';
import { LYRA_PORTRAIT } from '../../support/assets-api-fake';

const WOLF = {
  id: '1b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e',
  name: 'Lobo atroz',
  imageAssetId: null,
  width: 2,
  height: 2,
  frame: 'round' as const,
};

function renderCard(props: Partial<FormCardProps> = {}): void {
  render(
    <FormCard
      form={WOLF}
      index={1}
      selected={false}
      onMap={false}
      invalid={false}
      onSelect={() => undefined}
      {...props}
    />,
  );
}

describe('FormCard', () => {
  it('reads the name, the size and the key that switches to it', () => {
    renderCard();

    expect(screen.getByRole('button')).toHaveAccessibleName('Lobo atroz 2×2 casas · tecla 2');
    expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'false');
  });

  it('the first is marked "Base"; the one on the map, "No mapa"', () => {
    renderCard({ index: 0, onMap: true });

    expect(screen.getByRole('button')).toHaveAccessibleName(
      'Lobo atroz 2×2 casas · tecla 1 Base No mapa',
    );
  });

  it('without a name reads "Sem nome" with "?" on the face, and says when it has an error', () => {
    renderCard({ form: { ...WOLF, name: ' ' }, invalid: true });

    expect(screen.getByRole('button')).toHaveAccessibleName(
      'Sem nome 2×2 casas · tecla 2 (com erro)',
    );
    expect(screen.getByText('?')).toBeInTheDocument();
  });

  it('shows the image of the form instead of the initials', () => {
    renderCard({ form: { ...WOLF, imageAssetId: LYRA_PORTRAIT.id } });

    expect(screen.queryByText('LA')).toBeNull();
    expect(document.querySelector('img')).toHaveAttribute('src', `/api/assets/${LYRA_PORTRAIT.id}`);
  });

  it('the face of a square form is no disc', () => {
    renderCard({ form: { ...WOLF, frame: 'square' } });

    expect(screen.getByText('LA')).not.toHaveClass('rounded-full');
  });

  it('the face of a round form is a disc', () => {
    renderCard();

    expect(screen.getByText('LA')).toHaveClass('rounded-full');
  });

  it('a click selects it', async () => {
    let selected = 0;
    renderCard({ onSelect: () => (selected += 1) });

    await userEvent.click(screen.getByRole('button'));

    expect(selected).toBe(1);
  });
});
