/** `matchMedia` that answers every query with the same `matches` and records what was asked. */
export class MatchMediaFake {
  readonly queries: string[] = [];

  constructor(private readonly matches: boolean) {}

  readonly matchMedia = (query: string): { matches: boolean } => {
    this.queries.push(query);
    return { matches: this.matches };
  };
}
