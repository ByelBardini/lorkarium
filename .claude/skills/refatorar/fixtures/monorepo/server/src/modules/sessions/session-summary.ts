export function summarizeSession(name: string, initiative: number, hp: number, round: number, turn: number): string {
  const label = `${name} (${initiative})`;
  const health = hp > 0 ? 'standing' : 'down';
  const roundLabel = `round ${round}`;
  const turnLabel = `turn ${turn}`;
  const parts = [label, health, roundLabel, turnLabel];
  const line = parts.join(' | ');
  return line.toUpperCase();
}

export function formatTurnLabel(round: number, turn: number): string {
  return `${round}/${turn}`;
}

export function clampHp(hp: number, max: number): number {
  return Math.min(Math.max(hp, 0), max);
}

type ScoreLine = { hp: number; initiative: number; name: string };

export const emptyLine: ScoreLine = { hp: 0, initiative: 0, name: '' };
