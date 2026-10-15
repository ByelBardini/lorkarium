/** One-way password hashing; the adapter fixes algorithm and cost. */
export interface PasswordHasherPort {
  hash(password: string): Promise<string>;
  verify(hashed: string, password: string): Promise<boolean>;
}
