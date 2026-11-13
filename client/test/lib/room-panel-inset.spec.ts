import { describe, expect, it } from 'vitest';
import { roomPanelInsetClass } from '@/lib/room-panel-inset';

describe('roomPanelInsetClass', () => {
  it('the panel open leaves room for it and the rail beside it', () => {
    expect(roomPanelInsetClass({ panel: 'open', focus: false })).toBe('right-[406px]');
  });

  it('the panel collapsed still leaves room for the rail', () => {
    expect(roomPanelInsetClass({ panel: 'closed', focus: false })).toBe('right-[46px]');
  });

  it('in focus mode neither is drawn, open or not', () => {
    expect(roomPanelInsetClass({ panel: 'open', focus: true })).toBe('right-0');
    expect(roomPanelInsetClass({ panel: 'closed', focus: true })).toBe('right-0');
  });
});
