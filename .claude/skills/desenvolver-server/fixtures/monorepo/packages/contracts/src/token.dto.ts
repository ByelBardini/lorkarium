// Propositalmente errado: DTO sem Zod (só tipo, sem validação nos dois lados).
export type TokenDto = { id: string; column: number; row: number };
