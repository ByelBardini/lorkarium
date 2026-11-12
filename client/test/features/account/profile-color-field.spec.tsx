import type { MemberColorDto } from '@lorkarium/contracts';
import { render, screen, within } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { SavedColorsProvider } from '@/components/color-picker/saved-colors-context';
import { ProfileColorField } from '@/features/account/profile-color-field';
import { SavedColorsApiFake } from '../../support/saved-colors-api-fake';

const COLOR_NAMES = [
  'Ouro',
  'Aço',
  'Brasa',
  'Musgo',
  'Violeta',
  'Rosa',
  'Verde-água',
  'Osso',
] as const;

describe('ProfileColorField', () => {
  let onChange: Mock<(color: MemberColorDto) => void>;
  let user: UserEvent;

  beforeEach(() => {
    onChange = vi.fn();
    user = userEvent.setup();
  });

  function renderField(value: MemberColorDto): void {
    render(
      <SavedColorsProvider api={new SavedColorsApiFake()} userId="bia">
        <span id="color-title">Sua cor no mapa</span>
        <ProfileColorField
          value={value}
          onChange={onChange}
          labelledBy="color-title"
          describedBy="color-hint"
        />
        <p id="color-hint">Pinta seu ping no mapa.</p>
      </SavedColorsProvider>,
    );
  }

  function colors(): HTMLElement {
    return screen.getByRole('radiogroup', { name: 'Sua cor no mapa' });
  }

  it('the 8 colors stay radios and the value of the palette is the one marked', () => {
    renderField('rose');

    const names = within(colors())
      .getAllByRole('radio')
      .map((radio) => radio.getAttribute('aria-label'));
    expect(names).toEqual([...COLOR_NAMES]);
    expect(within(colors()).getByRole('radio', { name: 'Rosa' })).toBeChecked();
    expect(screen.getByRole('button', { name: 'Cor personalizada' })).toBeInTheDocument();
  });

  it('a custom value marks no radio and names the tile with the code', () => {
    renderField('#336699');

    const checked = within(colors())
      .getAllByRole('radio')
      .filter((radio) => radio.getAttribute('aria-checked') === 'true');
    expect(checked).toEqual([]);
    expect(screen.getByRole('button', { name: 'Cor personalizada: #336699' })).toBeInTheDocument();
  });

  it('"Usar cor" hands the custom color to the draft once', async () => {
    renderField('rose');

    await user.click(screen.getByRole('button', { name: 'Cor personalizada' }));
    const code = await screen.findByLabelText('Código da cor');
    await user.clear(code);
    await user.type(code, '#336699');
    await user.click(screen.getByRole('button', { name: 'Usar cor' }));

    expect(onChange.mock.calls).toEqual([['#336699']]);
  });

  it('a radio after a custom color hands that name to the draft', async () => {
    renderField('#336699');

    await user.click(within(colors()).getByRole('radio', { name: 'Musgo' }));

    expect(onChange.mock.calls).toEqual([['moss']]);
  });
});
