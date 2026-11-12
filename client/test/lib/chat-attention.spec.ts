import { describe, expect, it } from 'vitest';
import { ChatAttentionTracker, type ChatAttentionView } from '@/lib/chat-attention';

const AWAY: ChatAttentionView = { focused: false, roomCampaignId: null };
const IN_VHARN: ChatAttentionView = { focused: true, roomCampaignId: 'vharn' };
const VHARN_BEHIND: ChatAttentionView = { focused: false, roomCampaignId: 'vharn' };
const IN_SETTINGS: ChatAttentionView = { focused: true, roomCampaignId: null };
const IN_KORR: ChatAttentionView = { focused: true, roomCampaignId: 'korr' };

describe('ChatAttentionTracker', () => {
  it('a message with the app behind other windows flashes', () => {
    expect(new ChatAttentionTracker().messageArrived('vharn', AWAY)).toBe('flash');
  });

  it('a message to the room on screen with the app in front does nothing', () => {
    const tracker = new ChatAttentionTracker();
    expect(tracker.messageArrived('vharn', IN_VHARN)).toBeNull();
    expect(tracker.viewChanged(AWAY)).toBeNull();
  });

  it('a message to the room left behind other windows flashes: the chat is not seen', () => {
    expect(new ChatAttentionTracker().messageArrived('vharn', VHARN_BEHIND)).toBe('flash');
  });

  it('in front but outside the room waits, and flashes once the app leaves the front', () => {
    const tracker = new ChatAttentionTracker();
    expect(tracker.messageArrived('vharn', IN_SETTINGS)).toBeNull();
    expect(tracker.viewChanged(AWAY)).toBe('flash');
  });

  it('a message to another table than the room on screen stays pending', () => {
    const tracker = new ChatAttentionTracker();
    expect(tracker.messageArrived('vharn', IN_KORR)).toBeNull();
    expect(tracker.viewChanged(VHARN_BEHIND)).toBe('flash');
  });

  it('coming to the front elsewhere keeps it pending: leaving again flashes again', () => {
    const tracker = new ChatAttentionTracker();
    tracker.messageArrived('vharn', AWAY);
    expect(tracker.viewChanged(IN_SETTINGS)).toBeNull();
    expect(tracker.viewChanged(AWAY)).toBe('flash');
  });

  it('reaching the room in front stops it, and leaving afterwards flashes nothing', () => {
    const tracker = new ChatAttentionTracker();
    tracker.messageArrived('vharn', AWAY);
    expect(tracker.viewChanged(IN_VHARN)).toBe('stop');
    expect(tracker.viewChanged(AWAY)).toBeNull();
  });

  it('the room behind other windows does not count as seen', () => {
    const tracker = new ChatAttentionTracker();
    tracker.messageArrived('vharn', AWAY);
    expect(tracker.viewChanged(VHARN_BEHIND)).toBe('flash');
  });

  it('with two tables pending, seeing one keeps the button lit until the other is seen', () => {
    const tracker = new ChatAttentionTracker();
    tracker.messageArrived('vharn', AWAY);
    tracker.messageArrived('korr', AWAY);
    expect(tracker.viewChanged(IN_VHARN)).toBeNull();
    expect(tracker.viewChanged(AWAY)).toBe('flash');
    expect(tracker.viewChanged(IN_KORR)).toBe('stop');
  });

  it('closing the only pending table stops it; closing another keeps it', () => {
    const tracker = new ChatAttentionTracker();
    tracker.messageArrived('vharn', AWAY);
    expect(tracker.keepOnly(new Set(['vharn']))).toBeNull();
    expect(tracker.keepOnly(new Set(['korr']))).toBe('stop');
    expect(tracker.viewChanged(AWAY)).toBeNull();
  });

  it('nothing pending: tables closing and the app moving send nothing', () => {
    const tracker = new ChatAttentionTracker();
    expect(tracker.keepOnly(new Set())).toBeNull();
    expect(tracker.viewChanged(AWAY)).toBeNull();
    expect(tracker.viewChanged(IN_VHARN)).toBeNull();
  });
});
