// ==== Report ====

/** Builds the end-of-combat report line. */
export function buildReport(name: string, initiative: number, hp: number, round: number, turn: number): string {
  const label = `${name} (${initiative})`;
  const health = hp > 0 ? 'standing' : 'down';
  const roundLabel = `round ${round}`;
  const turnLabel = `turn ${turn}`;
  const parts = [label, health, roundLabel, turnLabel];
  const line = parts.join(' | ');
  return line.toUpperCase();
}

type CombatantScore = { name: string; initiative: number; hp: number };

export const emptyScore: CombatantScore = { name: '', initiative: 0, hp: 0 };
