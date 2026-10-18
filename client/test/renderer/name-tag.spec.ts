import { describe, expect, it } from 'vitest';
import { showsNameTag } from '@/renderer/name-tag';

describe('showsNameTag', () => {
  it('the token under the pointer shows its name', () => {
    expect(showsNameTag({ id: 'kael', selected: false }, 'kael')).toBe(true);
  });

  it('a selected token shows its name even without the pointer over it', () => {
    expect(showsNameTag({ id: 'kael', selected: true }, null)).toBe(true);
  });

  it('a token neither hovered nor selected hides it, even while another is hovered', () => {
    expect(showsNameTag({ id: 'kael', selected: false }, 'lyra')).toBe(false);
    expect(showsNameTag({ id: 'kael', selected: false }, null)).toBe(false);
  });
});
