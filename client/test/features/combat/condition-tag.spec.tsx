import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import {
  ConditionTagPreview,
  ConditionTags,
  EditableConditionTag,
} from '@/features/combat/condition-tag';
import { activeCondition } from '../../support/table-session-fixtures';

const POISON_TEXT = 'Desvantagem em ataques e testes de habilidade.';
const ENVENENADO = activeCondition({ name: 'Envenenado', description: POISON_TEXT });

function renderTags(description = POISON_TEXT): void {
  const condition = activeCondition({ name: 'Envenenado', description });
  render(<ConditionTags owner="Kael" conditions={[condition]} />);
}

describe('ConditionTags', () => {
  it('hovering the name of a described condition opens a tooltip with the description', async () => {
    renderTags();
    await userEvent.hover(screen.getByText('Envenenado'));
    expect(await screen.findByRole('tooltip')).toHaveTextContent(POISON_TEXT);
  });

  it('tabbing to the name opens the tooltip and ties it by aria-describedby', async () => {
    renderTags();
    await userEvent.tab();
    const name = screen.getByText('Envenenado');
    expect(name).toHaveFocus();
    const tooltip = await screen.findByRole('tooltip');
    expect(name).toHaveAttribute('aria-describedby', tooltip.id);
  });

  it('a long description shows whole in the tooltip, not cut', async () => {
    const long = 'a'.repeat(500);
    renderTags(long);
    await userEvent.hover(screen.getByText('Envenenado'));
    expect((await screen.findByRole('tooltip')).textContent).toBe(long);
  });

  it('without description the name is plain text: not focusable, no tooltip', async () => {
    renderTags('');
    const name = screen.getByText('Envenenado');
    expect(name).not.toHaveAttribute('tabindex');
    await userEvent.hover(name);
    await userEvent.tab();
    expect(screen.queryByRole('tooltip')).toBeNull();
  });
});

describe('EditableConditionTag', () => {
  it('the name of a described condition also opens its tooltip next to −, + and ×', async () => {
    render(
      <ul>
        <EditableConditionTag
          condition={ENVENENADO}
          disabled={false}
          onRounds={() => undefined}
          onStacks={() => undefined}
          onRemove={() => undefined}
        />
      </ul>,
    );
    const tag = screen.getByRole('listitem');
    expect(within(tag).getByRole('button', { name: 'Remover Envenenado' })).toBeInTheDocument();
    await userEvent.hover(within(tag).getByText('Envenenado'));
    expect(await screen.findByRole('tooltip')).toHaveTextContent(POISON_TEXT);
  });
});

describe('ConditionTagPreview', () => {
  it('shows one condition as a lone tag: mark, name and rounds, outside any list', () => {
    const condition = activeCondition({ name: 'Atordoado', tone: 'incapacitating' });
    const { container } = render(<ConditionTagPreview condition={condition} />);
    const tag = container.firstElementChild;
    expect(tag).toHaveTextContent('Atordoado2, 2 rodadas');
    expect(tag).toHaveClass('bg-destructive/15');
    expect(tag?.querySelector('[data-icon="flask-conical"]')).not.toBeNull();
    expect(screen.queryByRole('listitem')).toBeNull();
  });

  it('a described condition opens its description from the preview too', async () => {
    render(<ConditionTagPreview condition={ENVENENADO} />);
    await userEvent.hover(screen.getByText('Envenenado'));
    expect(await screen.findByRole('tooltip')).toHaveTextContent(POISON_TEXT);
  });
});

// Plays the token's detail: keeps each stack count asked by − or +.
class StacksRecorder {
  readonly asked: number[] = [];

  stacks = (stacks: number): void => {
    this.asked.push(stacks);
  };
}

describe('stacks on the tags', () => {
  const PILED = activeCondition({ name: 'Sangrando', maxStacks: 5, stacks: 3 });

  function renderEditable(condition = PILED, disabled = false): StacksRecorder {
    const recorder = new StacksRecorder();
    render(
      <ul>
        <EditableConditionTag
          condition={condition}
          disabled={disabled}
          onRounds={() => undefined}
          onStacks={recorder.stacks}
          onRemove={() => undefined}
        />
      </ul>,
    );
    return recorder;
  }

  it('a stacking condition reads "×3" after the name, said as ", 3 stacks"', () => {
    render(<ConditionTags owner="Kael" conditions={[PILED]} />);
    const tag = screen.getByRole('listitem');
    expect(tag).toHaveTextContent('Sangrando×3, 3 stacks2, 2 rodadas');
    expect(within(tag).getByText('×3')).toHaveAttribute('aria-hidden', 'true');
  });

  it('one stack of a stacking condition reads ", 1 stack"', () => {
    render(<ConditionTags owner="Kael" conditions={[{ ...PILED, stacks: 1 }]} />);
    expect(screen.getByRole('listitem')).toHaveTextContent('Sangrando×1, 1 stack2, 2 rodadas');
  });

  it('a condition that does not stack shows no count', () => {
    render(<ConditionTags owner="Kael" conditions={[activeCondition({ name: 'Cego' })]} />);
    expect(screen.getByRole('listitem').textContent).toBe('Cego2, 2 rodadas');
  });

  it('the preview of a stacking condition shows its count too', () => {
    const { container } = render(<ConditionTagPreview condition={{ ...PILED, stacks: 2 }} />);
    expect(container.firstElementChild).toHaveTextContent('Sangrando×2, 2 stacks2, 2 rodadas');
  });

  it('editable, a stacking condition has "Menos um stack" and "Mais um stack" around the count', () => {
    renderEditable();
    const tag = screen.getByRole('listitem');
    expect(within(tag).getByRole('button', { name: 'Menos um stack de Sangrando' })).toBeEnabled();
    expect(within(tag).getByRole('button', { name: 'Mais um stack de Sangrando' })).toBeEnabled();
    expect(tag).toHaveTextContent('×3, 3 stacks');
  });

  it('editable, a condition that does not stack has no stack buttons', () => {
    renderEditable(activeCondition({ name: 'Cego' }));
    expect(screen.queryByRole('button', { name: /stack/ })).toBeNull();
  });

  it('"Mais um stack" asks for one more and "Menos um stack" for one less', async () => {
    const recorder = renderEditable();
    await userEvent.click(screen.getByRole('button', { name: 'Mais um stack de Sangrando' }));
    await userEvent.click(screen.getByRole('button', { name: 'Menos um stack de Sangrando' }));
    expect(recorder.asked).toEqual([4, 2]);
  });

  it('at 1 stack "Menos um stack" is off, "Mais" still on', () => {
    renderEditable({ ...PILED, stacks: 1 });
    expect(screen.getByRole('button', { name: 'Menos um stack de Sangrando' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Mais um stack de Sangrando' })).toBeEnabled();
  });

  it('at the maximum "Mais um stack" is off, "Menos" still on', () => {
    renderEditable({ ...PILED, stacks: 5 });
    expect(screen.getByRole('button', { name: 'Mais um stack de Sangrando' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Menos um stack de Sangrando' })).toBeEnabled();
  });

  it('disabled, both stack buttons are off', () => {
    renderEditable(PILED, true);
    expect(screen.getByRole('button', { name: 'Mais um stack de Sangrando' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Menos um stack de Sangrando' })).toBeDisabled();
  });
});
