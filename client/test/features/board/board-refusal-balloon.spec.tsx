import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BoardRefusalBalloon, REFUSAL_BALLOON_MS } from '@/features/board/board-refusal-balloon';
import { createBoardInteractionStore } from '@/stores/board-interaction-store';
import { TableBoardCommandsFake } from '../../support/table-board-commands-fake';
import { VHARN_GRID } from '../../support/table-session-fixtures';

function renderBalloon() {
  const interaction = createBoardInteractionStore({
    scopeOf: () => VHARN_GRID,
    commands: new TableBoardCommandsFake(),
    describeRefusal: String,
  });
  render(<BoardRefusalBalloon interaction={interaction} />);
  return interaction;
}

const LIGHTS = 'Esta mesa usa o plano Grátis, que permite até 10 luzes por cena.';

describe('BoardRefusalBalloon', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('shows nothing without a refusal', () => {
    renderBalloon();
    expect(screen.queryByTestId('board-refusal-balloon')).toBeNull();
  });

  it('a refusal shows by the last pointer position, then goes away', () => {
    const interaction = renderBalloon();
    fireEvent.pointerMove(window, { clientX: 300, clientY: 200 });

    act(() => interaction.setState({ refusal: { text: LIGHTS, seq: 1 } }));

    const balloon = screen.getByTestId('board-refusal-balloon');
    expect(balloon).toHaveTextContent(LIGHTS);
    expect(balloon).toHaveStyle({ left: '314px', top: '214px' });
    act(() => vi.advanceTimersByTime(REFUSAL_BALLOON_MS));
    expect(screen.queryByTestId('board-refusal-balloon')).toBeNull();
  });

  it('the same sentence again shows again', () => {
    const interaction = renderBalloon();
    act(() => interaction.setState({ refusal: { text: LIGHTS, seq: 1 } }));
    act(() => vi.advanceTimersByTime(REFUSAL_BALLOON_MS));

    act(() => interaction.setState({ refusal: { text: LIGHTS, seq: 2 } }));

    expect(screen.getByTestId('board-refusal-balloon')).toHaveTextContent(LIGHTS);
  });
});
