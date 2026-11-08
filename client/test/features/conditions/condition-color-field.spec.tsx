import type { ConditionColorDto } from '@lorkarium/contracts';
import { render, screen, within } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { ConditionColorField } from '@/features/conditions/condition-color-field';

const LOW_CONTRAST = /pouco contraste/i;

describe('ConditionColorField', () => {
  let user: UserEvent;

  beforeEach(() => {
    user = userEvent.setup();
  });

  function renderField(value: ConditionColorDto | null): (ConditionColorDto | null)[] {
    const chosen: (ConditionColorDto | null)[] = [];
    render(<ConditionColorField value={value} tone="harm" onChange={(c) => chosen.push(c)} />);
    return chosen;
  }

  function checkedNames(): (string | null)[] {
    return within(screen.getByRole('radiogroup'))
      .getAllByRole('radio')
      .filter((swatch) => swatch.getAttribute('aria-checked') === 'true')
      .map((swatch) => swatch.getAttribute('aria-label'));
  }

  async function typeInPanel(code: string): Promise<void> {
    await user.click(screen.getByRole('button', { name: 'Cor personalizada' }));
    await screen.findByRole('dialog');
    await user.clear(screen.getByLabelText('Código da cor'));
    await user.type(screen.getByLabelText('Código da cor'), code);
  }

  it('a custom color is named by its code in the legend, the tile marked and no swatch checked', () => {
    renderField('#336699');

    expect(screen.getByText('· #336699')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cor personalizada: #336699' })).toBeInTheDocument();
    expect(checkedNames()).toEqual([]);
  });

  it('a color of the palette checks its swatch and leaves the tile with no color', () => {
    renderField('ember');

    expect(screen.getByText('· Brasa')).toBeInTheDocument();
    expect(checkedNames()).toEqual(['Cor: Brasa']);
    expect(screen.getByRole('button', { name: 'Cor personalizada' })).toBeInTheDocument();
  });

  it('no color keeps "Pela natureza" checked and named', () => {
    renderField(null);

    expect(screen.getByText('· Pela natureza')).toBeInTheDocument();
    expect(checkedNames()).toEqual(['Cor: Pela natureza']);
  });

  it('"Pela natureza" takes a custom color back to the tone (null)', async () => {
    const chosen = renderField('#336699');

    await user.click(screen.getByRole('radio', { name: 'Cor: Pela natureza' }));

    expect(chosen).toEqual([null]);
  });

  it('a swatch of the palette still chooses its name from a custom color', async () => {
    const chosen = renderField('#336699');

    await user.click(screen.getByRole('radio', { name: 'Cor: Céu' }));

    expect(chosen).toEqual(['sky']);
  });

  it('#101010 warns about the contrast on the card and can still be chosen', async () => {
    const chosen = renderField(null);

    await typeInPanel('#101010');

    expect(screen.getByText(LOW_CONTRAST)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Usar cor' }));
    expect(chosen).toEqual(['#101010']);
  });

  it('#d9b45a reads on the card: no warning', async () => {
    renderField(null);

    await typeInPanel('#d9b45a');

    expect(screen.queryByText(LOW_CONTRAST)).not.toBeInTheDocument();
  });

  it('the arrows walk the swatches only and never open the custom panel', async () => {
    renderField('bone');
    screen.getByRole('radio', { name: 'Cor: Osso' }).focus();

    await user.keyboard('{ArrowRight}');

    expect(screen.getByRole('radio', { name: 'Cor: Pela natureza' })).toHaveFocus();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
