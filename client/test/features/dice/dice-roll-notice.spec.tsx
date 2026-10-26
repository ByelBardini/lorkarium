import type { DiceRolledDto } from '@lorkarium/contracts';
import { act, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { DiceRollNotice } from '@/features/dice/dice-roll-notice';
import { diceHistoryStorageKey } from '@/stores/dice-history-store';
import { VHARN } from '../../support/campaigns-api-fake';
import { biaRolled, biaRolledSecretly, rollIdOf } from '../../support/dice-fixtures';
import { openVharnWithRoster, renderDicePanel } from '../../support/dice-panel-harness';
import { emulateViewport } from '../../support/viewport';
import { testDependencies, type TestDependencies } from '../../support/app-dependencies';

function renderNotice(deps: TestDependencies): void {
  const table = deps.openTables.getState().tables.find((open) => open.campaignId === VHARN.id);
  render(
    <DiceRollNotice
      campaignId={VHARN.id}
      openTables={deps.openTables}
      presence={table?.presence ?? null}
      roomLayout={deps.roomLayout}
      clock={deps.diceClock}
    />,
  );
}

function roll(deps: TestDependencies, event: DiceRolledDto): void {
  deps.tableSessionApi.emitTo(VHARN.id, { kind: 'diceRolled', event });
}

function advance(deps: TestDependencies, ms: number): void {
  act(() => deps.diceClock.advance(ms));
}

function notice(): HTMLElement {
  return screen.getByTestId('dice-roll-notice');
}

function liveRegions(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('[aria-live]')];
}

describe('DiceRollNotice', () => {
  let deps: TestDependencies;

  beforeEach(() => {
    deps = testDependencies();
    openVharnWithRoster(deps);
  });

  it('shows nothing while the dice roll, then who, label, formula and 22 when they stop', () => {
    renderNotice(deps);
    roll(deps, biaRolled());
    advance(deps, 2399);
    expect(screen.queryByTestId('dice-roll-notice')).toBeNull();
    advance(deps, 1);
    expect(within(notice()).getByText('Bia rolou · Acerto')).toBeInTheDocument();
    expect(within(notice()).getByText('1d20+5')).toBeInTheDocument();
    expect(within(notice()).getByText('22')).toBeInTheDocument();
  });

  it('goes away 4 s after the reveal', () => {
    renderNotice(deps);
    roll(deps, biaRolled());
    advance(deps, 2400 + 3999);
    expect(notice()).toBeInTheDocument();
    advance(deps, 1);
    expect(screen.queryByTestId('dice-roll-notice')).toBeNull();
  });

  it('a roll without label says only "Bia rolou"', () => {
    renderNotice(deps);
    roll(deps, biaRolled({ label: null }));
    advance(deps, 2400);
    expect(within(notice()).getByText('Bia rolou')).toBeInTheDocument();
  });

  it('a newer roll that reveals replaces the notice of the one before', () => {
    renderNotice(deps);
    roll(deps, biaRolled({ rollId: rollIdOf(1), label: 'Primeira' }));
    advance(deps, 1000);
    roll(deps, biaRolled({ rollId: rollIdOf(2), label: 'Segunda', total: 9 }));
    advance(deps, 1400);
    expect(within(notice()).getByText('Bia rolou · Primeira')).toBeInTheDocument();
    advance(deps, 1000);
    expect(within(notice()).getByText('Bia rolou · Segunda')).toBeInTheDocument();
    expect(within(notice()).queryByText('Bia rolou · Primeira')).toBeNull();
  });

  it('a masters-only notice ("rolou em segredo") never becomes a notice nor an announcement', () => {
    renderNotice(deps);
    deps.tableSessionApi.emitTo(VHARN.id, {
      kind: 'diceRolledSecretly',
      event: biaRolledSecretly(),
    });
    advance(deps, 800);
    expect(screen.queryByTestId('dice-roll-notice')).toBeNull();
    expect(liveRegions()[0]).toHaveTextContent('');
  });

  it('a natural 20 paints the total gold and the border primary', () => {
    renderNotice(deps);
    const part = { label: 'Acerto', expression: '1d20+5', total: 25 };
    roll(
      deps,
      biaRolled({
        parts: [{ ...part, dice: [{ sides: 20, value: 20, status: 'kept' }] }],
        total: 25,
      }),
    );
    advance(deps, 2400);
    expect(within(notice()).getByText('25')).toHaveClass('text-primary');
    expect(notice()).toHaveClass('border-primary');
  });

  it('a plain total keeps the neutral border', () => {
    renderNotice(deps);
    roll(deps, biaRolled());
    advance(deps, 2400);
    expect(within(notice()).getByText('22')).not.toHaveClass('text-primary');
    expect(notice()).not.toHaveClass('border-primary');
  });

  it('the polite region is there before any roll and says "Bia rolou 22 (Acerto)." on reveal', () => {
    renderNotice(deps);
    const [region] = liveRegions();
    expect(region).toHaveAttribute('aria-live', 'polite');
    roll(deps, biaRolled());
    expect(region).toHaveTextContent('');
    advance(deps, 2400);
    expect(region).toHaveTextContent('Bia rolou 22 (Acerto).');
  });

  it('with the "Dados" tab open the roll is announced once: the history no longer announces', () => {
    renderDicePanel(deps);
    renderNotice(deps);
    roll(deps, biaRolled());
    advance(deps, 2400);
    const saying = liveRegions().filter((region) => region.textContent?.includes('Bia rolou 22'));
    expect(saying).toHaveLength(1);
  });

  it('never blocks the board under it', () => {
    renderNotice(deps);
    roll(deps, biaRolled());
    advance(deps, 2400);
    expect(notice().parentElement).toHaveClass('pointer-events-none');
  });

  it('sits centred left of the open panel, and over the whole board with the panel closed', () => {
    renderNotice(deps);
    roll(deps, biaRolled());
    advance(deps, 2400);
    expect(notice().parentElement).toHaveClass('right-90');
    act(() => deps.roomLayout.getState().togglePanel());
    expect(notice().parentElement).toHaveClass('right-0');
  });

  it('in focus mode the panel is hidden, so it centres over the whole board', () => {
    renderNotice(deps);
    roll(deps, biaRolled());
    advance(deps, 2400);
    act(() => deps.roomLayout.getState().toggleFocus());
    expect(notice().parentElement).toHaveClass('right-0');
  });
});

describe('DiceRollNotice on a phone', () => {
  emulateViewport('mobile');

  it('sits above the "Painel" button', () => {
    const deps = testDependencies();
    openVharnWithRoster(deps);
    renderNotice(deps);
    roll(deps, biaRolled());
    advance(deps, 2400);
    expect(notice().parentElement).toHaveClass('bottom-16');
  });
});

describe('DiceRollNotice after an F5', () => {
  it('a roll already revealed when the room opens never shows', () => {
    const deps = testDependencies();
    const played = biaRolled();
    const stored = {
      ...played,
      throw: null,
      parts: played.parts.map((part) => ({
        ...part,
        dice: part.dice.map(({ sides, value, status }) => ({ sides, value, status })),
      })),
    };
    deps.tabStorage.setItem(
      diceHistoryStorageKey(VHARN.id),
      JSON.stringify([{ kind: 'rolled', event: stored, receivedAtMs: 0, revealAtMs: 2400 }]),
    );
    deps.diceClock.advance(3000);
    openVharnWithRoster(deps);
    renderNotice(deps);
    expect(screen.queryByTestId('dice-roll-notice')).toBeNull();
    expect(liveRegions()[0]).toHaveTextContent('');
  });
});
