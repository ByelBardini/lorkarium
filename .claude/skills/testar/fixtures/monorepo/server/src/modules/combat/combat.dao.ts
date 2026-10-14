export class CombatDao {
  constructor(private readonly db: { query(sql: string): Promise<string[]> }) {}

  findNames(combatId: string): Promise<string[]> {
    return this.db.query(`select name from combatants where combat_id = '${combatId}'`);
  }
}
