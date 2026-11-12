import { act, renderHook, type RenderHookResult } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useMountedRenderer, type MountedRenderer } from '@/features/board/use-mounted-renderer';
import type { BoardIntent } from '@/renderer/board-renderer';
import { createBoardInteractionStore } from '@/stores/board-interaction-store';
import { BoardRenderersFake } from '../../support/board-renderer-fake';
import { TableBoardCommandsFake } from '../../support/table-board-commands-fake';
import { VHARN_GRID } from '../../support/table-session-fixtures';

describe('useMountedRenderer', () => {
  let renderers: BoardRenderersFake;
  let intents: BoardIntent[];

  beforeEach(() => {
    renderers = new BoardRenderersFake();
    intents = [];
  });

  function mounted(): RenderHookResult<MountedRenderer, unknown> {
    const hostRef = { current: document.createElement('div') };
    const interaction = createBoardInteractionStore({
      scopeOf: () => VHARN_GRID,
      commands: new TableBoardCommandsFake(),
      describeRefusal: String,
    });
    const props = {
      createBoardRenderer: renderers.create,
      onIntent: (intent: BoardIntent) => intents.push(intent),
      onRenderer: () => undefined,
      interaction,
      lossClock: () => 0,
    };
    return renderHook(() => useMountedRenderer(hostRef, props));
  }

  it('a loss reported again by the renderer already replaced mounts nothing more', async () => {
    mounted();
    await act(() => Promise.resolve());
    const first = renderers.latest();
    first.lose();
    await act(() => Promise.resolve());
    first.lose();
    await act(() => Promise.resolve());
    expect(renderers.made).toHaveLength(2);
    expect(renderers.alive).toEqual([renderers.latest()]);
  });

  it('a remount whose mount fails ends in the failure, with no renderer alive', async () => {
    const { result } = mounted();
    await act(() => Promise.resolve());
    renderers.mountMode = 'reject';
    renderers.latest().lose();
    await act(() => Promise.resolve());
    expect(result.current.failed).toBe(true);
    expect(result.current.renderer).toBeNull();
    expect(renderers.alive).toEqual([]);
  });

  it('a renderer that fails to load ends in the failure, and the retry loads it again', async () => {
    renderers.loads = false;
    const { result } = mounted();
    await act(() => Promise.resolve());
    expect(result.current.failed).toBe(true);
    expect(renderers.made).toEqual([]);

    renderers.loads = true;
    act(() => result.current.retry());
    await act(() => Promise.resolve());

    expect(renderers.calls).toBe(2);
    expect(result.current.failed).toBe(false);
    expect(result.current.renderer).toBe(renderers.latest());
  });

  it('a mount torn down while its renderer still loads destroys it once it arrives', async () => {
    const { unmount } = mounted();
    unmount();
    await act(() => Promise.resolve());

    expect(renderers.made).toHaveLength(1);
    expect(renderers.alive).toEqual([]);
    expect(renderers.latest().mounted).toBe(false);
  });

  it('the intents other than a lost context reach onIntent', async () => {
    mounted();
    await act(() => Promise.resolve());
    renderers.latest().emit({ kind: 'cameraChanged', zoom: 2 });
    expect(intents).toEqual([{ kind: 'cameraChanged', zoom: 2 }]);
  });
});
