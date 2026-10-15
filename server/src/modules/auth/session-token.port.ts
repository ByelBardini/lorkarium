/** Session secrets: the cookie carries `generate()`, the database keeps only `hash(token)`. */
export interface SessionTokenPort {
  generate(): string;
  hash(token: string): string;
}
