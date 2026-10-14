export class CombatDao {
  constructor(private readonly db: unknown) {}

  currentRound(combatId: string): { combatId: string; db: unknown } {
    return { combatId, db: this.db };
  }
}
