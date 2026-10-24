import type { ActiveConditionDto } from '@lorkarium/contracts';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ConditionTagPreview, ConditionTags } from '@/features/combat/condition-tag';
import { activeCondition } from '../../support/table-session-fixtures';

function previewOf(overrides: Partial<ActiveConditionDto>): HTMLElement {
  const { container } = render(<ConditionTagPreview condition={activeCondition(overrides)} />);
  const tag = container.firstElementChild;
  if (!(tag instanceof HTMLElement)) throw new Error('expected the preview tag');
  return tag;
}

describe('the color of a condition tag', () => {
  it.each(['benefit', 'harm'] as const)(
    'a %s condition in ember has its border in ember at alpha 0.6, no fill and no tone class',
    (tone) => {
      const tag = previewOf({ tone, color: 'ember' });
      expect(tag.style.borderColor).toBe('rgba(236, 122, 69, 0.6)');
      expect(tag.style.backgroundColor).toBe('');
      expect(tag).not.toHaveClass('border-primary/45');
      expect(tag).not.toHaveClass('border-destructive/60');
    },
  );

  it('an incapacitating condition in sky has a full sky border and a 15% sky fill', () => {
    const tag = previewOf({ tone: 'incapacitating', color: 'sky' });
    expect(tag.style.borderColor).toBe('rgb(92, 188, 238)');
    expect(tag.style.backgroundColor).toBe('rgba(92, 188, 238, 0.15)');
    expect(tag).not.toHaveClass('bg-destructive/15');
  });

  it.each([
    ['benefit', 'border-primary/45'],
    ['harm', 'border-destructive/60'],
    ['incapacitating', 'bg-destructive/15'],
  ] as const)(
    'a %s condition without a color keeps the class %s and no inline style',
    (tone, cls) => {
      const tag = previewOf({ tone, color: null });
      expect(tag).toHaveClass(cls);
      expect(tag.getAttribute('style')).toBeNull();
    },
  );

  it('the tag in the token list wears the color on its border and its icon', () => {
    const poisoned = activeCondition({ name: 'Envenenado', color: 'ember' });
    render(<ConditionTags owner="Kael" conditions={[poisoned]} />);
    const tag = screen.getByRole('listitem');
    expect(tag.style.borderColor).toBe('rgba(236, 122, 69, 0.6)');
    expect(tag.querySelector('[data-icon]')).toHaveStyle({ color: '#ec7a45' });
  });
});
