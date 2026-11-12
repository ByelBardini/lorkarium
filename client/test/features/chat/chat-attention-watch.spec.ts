import { beforeEach, describe, expect, it } from 'vitest';
import { ChatAttentionWatch } from '@/features/chat/chat-attention-watch';
import { FocusWindowFake, TaskbarAttentionFake } from '../../support/chat-attention-fakes';

describe('ChatAttentionWatch', () => {
  let taskbar: TaskbarAttentionFake;
  let main: FocusWindowFake;
  let deferred: (() => void)[];
  let watch: ChatAttentionWatch;

  // The focus settles before the watch reads it: the test runs the deferred reads by hand.
  const settle = (): void => {
    for (const run of deferred.splice(0)) run();
  };

  beforeEach(() => {
    taskbar = new TaskbarAttentionFake();
    main = new FocusWindowFake(true);
    deferred = [];
    watch = new ChatAttentionWatch(taskbar, main, (run) => deferred.push(run));
  });

  it('a message with the main window out of focus lights the button', () => {
    main.blur();
    settle();
    watch.messageArrived('vharn');
    expect(taskbar.commands).toEqual(['request']);
  });

  it('a message to the room on screen with the window in front lights nothing', () => {
    watch.showRoom('vharn', null);
    watch.messageArrived('vharn');
    main.blur();
    settle();
    expect(taskbar.commands).toEqual([]);
  });

  it('outside the room the button lights once the window loses focus', () => {
    watch.messageArrived('vharn');
    expect(taskbar.commands).toEqual([]);
    main.blur();
    settle();
    expect(taskbar.commands).toEqual(['request']);
  });

  it('opening the room in front puts the button out', () => {
    main.blur();
    settle();
    watch.messageArrived('vharn');
    main.focus();
    settle();
    watch.showRoom('vharn', null);
    expect(taskbar.commands).toEqual(['request', 'stop']);
  });

  it('coming back to the room already on screen puts it out', () => {
    watch.showRoom('vharn', null);
    main.blur();
    settle();
    watch.messageArrived('vharn');
    main.focus();
    settle();
    expect(taskbar.commands).toEqual(['request', 'stop']);
  });

  it('the detached chat window in front counts as seeing the room', () => {
    const chatWindow = new FocusWindowFake(false);
    watch.showRoom('vharn', chatWindow);
    main.blur();
    chatWindow.focus();
    settle();
    watch.messageArrived('vharn');
    expect(taskbar.commands).toEqual([]);
    chatWindow.blur();
    settle();
    watch.messageArrived('vharn');
    expect(taskbar.commands).toEqual(['request']);
  });

  it('a closed chat window is not in front', () => {
    const chatWindow = new FocusWindowFake(true);
    chatWindow.closed = true;
    watch.showRoom('vharn', chatWindow);
    main.blur();
    settle();
    watch.messageArrived('vharn');
    expect(taskbar.commands).toEqual(['request']);
  });

  it('leaving the room stops hearing its chat window and no longer counts it as seen', () => {
    const chatWindow = new FocusWindowFake(false);
    const leave = watch.showRoom('vharn', chatWindow);
    leave();
    expect(chatWindow.listenerCount()).toBe(0);
    watch.messageArrived('vharn');
    main.blur();
    settle();
    expect(taskbar.commands).toEqual(['request']);
  });

  it('a late leave of an older room keeps the newer one on screen', () => {
    const leaveOld = watch.showRoom('korr', null);
    watch.showRoom('vharn', null);
    leaveOld();
    watch.messageArrived('vharn');
    main.blur();
    settle();
    expect(taskbar.commands).toEqual([]);
  });

  it('closing the pending table puts the button out', () => {
    main.blur();
    settle();
    watch.messageArrived('vharn');
    watch.keepOnly(new Set());
    expect(taskbar.commands).toEqual(['request', 'stop']);
  });
});
