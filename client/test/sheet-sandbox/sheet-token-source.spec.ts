import { describe, expect, it } from 'vitest';
import { boardTokenSource } from '@/sheet-sandbox/sheet-token-source';
import { createBoardStore } from '@/stores/board-store';
import { VHARN } from '../support/campaigns-api-fake';
import { LYRA_ANCHOR_ID, castBoard, lyraAnchor } from '../support/cast-fixtures';

function castWithLyra() {
  const cast = createBoardStore(VHARN.id, () => undefined);
  cast.getState().apply({ kind: 'board', state: castBoard() });
  return cast;
}

describe('boardTokenSource', () => {
  it('reads the token of the board store by its id', () => {
    const source = boardTokenSource(castWithLyra(), LYRA_ANCHOR_ID);
    expect(source.current()).toEqual(lyraAnchor());
  });

  it('a token the store does not have (or a store still loading) is null', () => {
    const loading = createBoardStore(VHARN.id, () => undefined);
    const missing = boardTokenSource(castWithLyra(), '0f0e0d0c-0b0a-4908-8706-050403020100');
    expect([boardTokenSource(loading, LYRA_ANCHOR_ID).current(), missing.current()]).toEqual([
      null,
      null,
    ]);
  });

  it('tells its listener when the store changes, until unsubscribed', () => {
    const cast = castWithLyra();
    const heard: string[] = [];
    const unsubscribe = boardTokenSource(cast, LYRA_ANCHOR_ID).subscribe(() =>
      heard.push('change'),
    );
    cast.getState().apply({ kind: 'board', state: castBoard({ version: 4 }) });
    unsubscribe();
    cast.getState().apply({ kind: 'board', state: castBoard({ version: 5 }) });
    expect(heard).toEqual(['change']);
  });
});
