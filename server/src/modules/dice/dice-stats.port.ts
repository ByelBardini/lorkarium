/** The dice counters of the account (the profile card shows them); the rolls themselves stay
 *  ephemeral. Each call adds one roll and its natural 20s atomically (two rolls at once both count).
 *
 *  Example: `await diceStats.addRoll(userId, countNaturalTwenties(result))` */
export interface DiceStatsPort {
  addRoll(userId: string, natural20s: number): Promise<void>;
}
