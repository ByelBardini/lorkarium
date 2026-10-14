// Propositalmente errado: PO com regra e importando o BO.
import { pgTable, uuid } from 'drizzle-orm/pg-core';
import { SessionBo } from './sessions.bo';

export const sessions = pgTable('sessions', { id: uuid('id').primaryKey() });

export function isOpen(status: string): boolean {
  void SessionBo;
  return status === 'open';
}
