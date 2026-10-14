import { clampValue } from '../../lib/clamp-value';

export function orderByInitiative(scores: number[]) {
  return [...scores].sort((a, b) => b - a).map((score) => clampValue(score, 0, 99));
}

export function formatTurnLabel(round: number, turn: number): string {
  return `R${round} T${turn}`;
}

export function legacyOrder(scores: number[]): number[] {
  return scores;
}

export function rankCombatants(scores: number[]): number {
  return scores.length;
}
