import { describe, expect, it } from 'vitest';
import { addTag, hasRoomForTag, removeLastTag, removeTag } from '@/lib/campaign-tags';

const EIGHT = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

describe('addTag', () => {
  it('adds the typed tag trimmed at the end', () => {
    expect(addTag(['Horror'], '  Sandbox ')).toEqual(['Horror', 'Sandbox']);
  });

  it('a tag repeated without accent nor case is ignored', () => {
    const tags = ['Mistério'];
    expect(addTag(tags, ' MISTERIO ')).toBe(tags);
  });

  it('a ninth tag is ignored', () => {
    expect(addTag(EIGHT, 'nine')).toBe(EIGHT);
  });

  it.each(['', '   '])('a blank text "%s" is ignored', (typed) => {
    const tags = ['Horror'];
    expect(addTag(tags, typed)).toBe(tags);
  });

  it('a tag of 25 characters is ignored; one of 24 is added', () => {
    expect(addTag([], 'x'.repeat(25))).toEqual([]);
    expect(addTag([], 'x'.repeat(24))).toEqual(['x'.repeat(24)]);
  });
});

describe('removeLastTag', () => {
  it('takes the last tag out', () => {
    expect(removeLastTag(['Horror', 'Sandbox'])).toEqual(['Horror']);
  });

  it('no tag leaves the same empty list', () => {
    const tags: string[] = [];
    expect(removeLastTag(tags)).toBe(tags);
  });
});

describe('removeTag', () => {
  it('takes the named tag out and keeps the others in order', () => {
    expect(removeTag(['Horror', 'Sandbox', 'Roleplay'], 'Sandbox')).toEqual(['Horror', 'Roleplay']);
  });
});

describe('hasRoomForTag', () => {
  it('seven tags still have room; eight do not', () => {
    expect(hasRoomForTag(EIGHT.slice(0, 7))).toBe(true);
    expect(hasRoomForTag(EIGHT)).toBe(false);
  });
});
