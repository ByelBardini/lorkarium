import { describe, expect, it } from 'vitest';
import { keepDesktopCommits, scopedToDesktop } from '../../release/desktop-commits';
import { CommitFilesFake, commitOf, releaseContextOf } from '../support/commit-files-fake';

const CONVENTIONAL = { preset: 'conventionalcommits' };

const files = new CommitFilesFake({
  shell: ['desktop/src-tauri/src/tray.rs'],
  splash: ['desktop/src/splash-state.ts'],
  client: ['client/src/features/board/board-page.tsx'],
  both: ['client/src/lib/desktop-shell.ts', 'desktop/src-tauri/src/webview2.rs'],
  lookalike: ['desktop-notes/readme.md', 'docs/context/desktop.md'],
  merge: [],
});

describe('keepDesktopCommits', () => {
  it('keeps a commit that changed the shell and drops one that only changed the client', () => {
    const kept = keepDesktopCommits(
      [commitOf('shell', 'feat(desktop): bandeja'), commitOf('client', 'feat(client): abas')],
      files,
    );

    expect(kept.map((commit) => commit.hash)).toEqual(['shell']);
  });

  it('keeps a commit that changed the shell together with another workspace', () => {
    const kept = keepDesktopCommits([commitOf('both', 'fix: user-agent')], files);

    expect(kept.map((commit) => commit.hash)).toEqual(['both']);
  });

  it('drops paths that only start with the word desktop, like the context doc', () => {
    const kept = keepDesktopCommits([commitOf('lookalike', 'docs: desktop')], files);

    expect(kept).toEqual([]);
  });

  it('drops a merge commit, which lists no path of its own', () => {
    const kept = keepDesktopCommits([commitOf('merge', 'Merge pull request #40')], files);

    expect(kept).toEqual([]);
  });
});

describe('scopedToDesktop', () => {
  it('releases a minor for a feat in the shell', async () => {
    const context = releaseContextOf([commitOf('shell', 'feat(desktop): bandeja')]);

    await expect(scopedToDesktop(files).analyzeCommits(CONVENTIONAL, context)).resolves.toBe(
      'minor',
    );
  });

  it('releases nothing when the feat only touched the client', async () => {
    const context = releaseContextOf([
      commitOf('client', 'feat(client): abas'),
      commitOf('splash', 'test(desktop): splash'),
    ]);

    await expect(scopedToDesktop(files).analyzeCommits(CONVENTIONAL, context)).resolves.toBeNull();
  });

  it('releases a patch for a fix even when a client feat came in the same push', async () => {
    const context = releaseContextOf([
      commitOf('client', 'feat(client): abas'),
      commitOf('splash', 'fix(desktop): barra da splash'),
    ]);

    await expect(scopedToDesktop(files).analyzeCommits(CONVENTIONAL, context)).resolves.toBe(
      'patch',
    );
  });

  it('releases a major for a breaking change in the shell', async () => {
    const context = releaseContextOf([commitOf('shell', 'feat(desktop)!: nova origem')]);

    await expect(scopedToDesktop(files).analyzeCommits(CONVENTIONAL, context)).resolves.toBe(
      'major',
    );
  });

  it('writes notes with the shell commits and without the client ones', async () => {
    const context = releaseContextOf([
      commitOf('shell', 'feat(desktop): bandeja do Windows'),
      commitOf('client', 'feat(client): abas da cena'),
    ]);

    const notes = await scopedToDesktop(files).generateNotes(CONVENTIONAL, context);

    expect(notes).toContain('bandeja do Windows');
    expect(notes).not.toContain('abas da cena');
  });
});
