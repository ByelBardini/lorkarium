import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ToolbarMenuSelect } from '@/rich-text-editor/toolbar-menu-select';

const STYLES = [
  { value: 'paragraph', label: 'Texto normal', separated: true },
  { value: '1', label: 'Título 1' },
];

describe('ToolbarMenuSelect', () => {
  it('shows the chosen label, marks it in the menu and hands back the one picked', async () => {
    const chosen: string[] = [];
    render(
      <ToolbarMenuSelect
        label="Estilo do parágrafo"
        value="paragraph"
        options={STYLES}
        onChoose={(value) => chosen.push(value)}
      />,
    );
    const trigger = screen.getByRole('button', { name: 'Estilo do parágrafo' });
    expect(trigger).toHaveTextContent('Texto normal');
    await userEvent.click(trigger);
    expect(screen.getByRole('menuitemradio', { name: 'Texto normal' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByRole('separator')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('menuitemradio', { name: 'Título 1' }));
    expect(chosen).toEqual(['1']);
  });
});
