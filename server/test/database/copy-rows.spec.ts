import { sql } from 'drizzle-orm';
import { PgDialect, integer, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import { copyRowsSql, sceneRowsCopySql, uuidArray } from '../../src/database/copy-rows';

const candles = pgTable('candles', {
  id: uuid('id').primaryKey().defaultRandom(),
  sceneId: uuid('scene_id').notNull(),
  candleOrder: integer('candle_order').notNull().generatedAlwaysAsIdentity(),
  label: text('label').notNull(),
});

const dialect = new PgDialect();

describe('copyRowsSql', () => {
  it('copies every column as it is, replaces the given ones and skips the identity order', () => {
    const query = copyRowsSql(
      candles,
      { id: sql`gen_random_uuid()`, sceneId: sql`${'to-scene'}::uuid` },
      sql`FROM ${candles} WHERE ${candles.sceneId} = ${'from-scene'}`,
    );

    expect(dialect.sqlToQuery(query)).toMatchObject({
      sql: 'INSERT INTO "candles" ("id", "scene_id", "label") SELECT gen_random_uuid(), $1::uuid, "candles"."label" FROM "candles" WHERE "candles"."scene_id" = $2',
      params: ['to-scene', 'from-scene'],
    });
  });
});

describe('uuidArray', () => {
  it('turns ids into one uuid[] parameter, never a list of parameters', () => {
    const query = sql`SELECT ${uuidArray(['a1', 'b2'])}`;

    expect(dialect.sqlToQuery(query)).toMatchObject({
      sql: 'SELECT $1::uuid[]',
      params: ['{a1,b2}'],
    });
  });
});

describe('sceneRowsCopySql', () => {
  it('puts the rows of one scene in the other with new ids, in their order', () => {
    const copy = { table: candles, sceneId: candles.sceneId, order: candles.candleOrder };

    expect(dialect.sqlToQuery(sceneRowsCopySql(copy, 'from-scene', 'to-scene'))).toMatchObject({
      sql: 'INSERT INTO "candles" ("id", "scene_id", "label") SELECT gen_random_uuid(), $1::uuid, "candles"."label" FROM "candles" WHERE "candles"."scene_id" = $2 ORDER BY "candles"."candle_order"',
      params: ['to-scene', 'from-scene'],
    });
  });
});
