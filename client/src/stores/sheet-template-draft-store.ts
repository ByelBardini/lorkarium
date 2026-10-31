import {
  SHEET_TEMPLATE_SOURCE_MAX_BYTES,
  type SheetTemplateDto,
  type UpdateSheetTemplateRequestDto,
} from '@lorkarium/contracts';
import { createStore, type StoreApi } from 'zustand/vanilla';
import type {
  SheetTemplatesApi,
  SheetTemplatesFailure,
  SheetTemplatesResult,
} from '@/services/sheet-templates-api';

/** What the master is typing: the name and the three sources. */
export type TemplateDraft = Readonly<{ name: string; html: string; css: string; js: string }>;

/** `conflict`: another master saved; `stashed`: the current version is loaded and the master's
 *  own text waits in `stash`. */
export type DraftPhase = 'idle' | 'saving' | 'saved' | 'conflict' | 'stashed' | 'failed';

/** `not_found`: the template is gone (deleted, or never was): the tab of it closes. */
export type TemplateLoad = 'loading' | 'ready' | 'failed' | 'not_found';

export type SheetTemplateDraftState = Readonly<{
  load: TemplateLoad;
  base: SheetTemplateDto | null;
  draft: TemplateDraft;
  phase: DraftPhase;
  /** Why the last read or save failed (the editor words it). */
  failure: TemplateFailure | null;
  stash: TemplateDraft | null;
  /** The first read, once; later calls do nothing. */
  start: () => Promise<void>;
  /** Reads again after a failed first read ("Tentar de novo"). */
  reload: () => Promise<void>;
  /** Something changed in the library: a deleted template becomes `not_found`, a newer version
   *  replaces the editor's text only when nothing is unsaved (the conflict keeps the rest). */
  refresh: () => Promise<void>;
  edit: (changes: Partial<TemplateDraft>) => void;
  save: () => Promise<void>;
  loadCurrent: () => Promise<void>;
  restoreMine: () => void;
  /** Throws the unsaved text away: the draft goes back to the version read. */
  discard: () => void;
}>;

export type TemplateFailure = SheetTemplatesFailure['kind'];

export type SheetTemplateDraftScope = Readonly<{
  api: SheetTemplatesApi;
  campaignId: string;
  templateId: string;
}>;

type Set = StoreApi<SheetTemplateDraftState>['setState'];
type Get = () => SheetTemplateDraftState;
type Draft = Readonly<{ scope: SheetTemplateDraftScope; set: Set; get: Get }>;

const EMPTY: TemplateDraft = { name: '', html: '', css: '', js: '' };
const LOADING = {
  load: 'loading',
  base: null,
  draft: EMPTY,
  phase: 'idle',
  failure: null,
  stash: null,
} as const;
const encoder = new TextEncoder();

/** The UTF-8 bytes of html + css + js, the measure of `SHEET_TEMPLATE_SOURCE_MAX_BYTES`.
 *
 *  Example: `sourceBytes({ name: '', html: 'é', css: '', js: '' }) // 2` */
export function sourceBytes(draft: TemplateDraft): number {
  return [draft.html, draft.css, draft.js].reduce(
    (sum, text) => sum + encoder.encode(text).byteLength,
    0,
  );
}

/** Whether the draft differs from the version read (a blank name is never sent: no change).
 *
 *  Example: `if (isTemplateDraftDirty(store.getState())) await askBeforeLeaving()` */
export function isTemplateDraftDirty(state: Pick<SheetTemplateDraftState, 'base' | 'draft'>) {
  return state.base !== null && !sameDraft(draftOf(state.base), state.draft);
}

/** One template's editor state outside React, so the editor can move between the library, a room
 *  tab and a window (each remounts it) without losing the text, and two editors of the same
 *  template on this client share one draft.
 *
 *  Example: `const draft = createSheetTemplateDraftStore({ api, campaignId, templateId }); void draft.getState().start()` */
export function createSheetTemplateDraftStore(
  scope: SheetTemplateDraftScope,
): StoreApi<SheetTemplateDraftState> {
  return createStore<SheetTemplateDraftState>()((set, get) => {
    const draft: Draft = { scope, set, get };
    let started = false;
    return {
      ...LOADING,
      start: async () => {
        if (started) return;
        started = true;
        await firstRead(draft);
      },
      reload: () => firstRead(draft),
      refresh: () => refresh(draft),
      edit: (changes) => set((state) => ({ draft: { ...state.draft, ...changes } })),
      save: () => saveDraft(draft),
      loadCurrent: () => loadCurrent(draft),
      restoreMine: () => set(restoredMine),
      discard: () => set(discarded),
    };
  });
}

function readDetail(draft: Draft): Promise<SheetTemplatesResult<SheetTemplateDto>> {
  return draft.scope.api.detail(draft.scope.campaignId, draft.scope.templateId);
}

async function firstRead(draft: Draft): Promise<void> {
  draft.set(LOADING);
  const result = await readDetail(draft);
  if (!result.ok) return draft.set({ load: loadOfFailure(result), failure: result.failure.kind });
  draft.set({ load: 'ready', base: result.value, draft: draftOf(result.value) });
}

async function refresh(draft: Draft): Promise<void> {
  const { load, phase } = draft.get();
  if (load !== 'ready' || phase === 'saving') return;
  const result = await readDetail(draft);
  if (!result.ok) {
    if (result.failure.kind === 'not_found')
      draft.set({ load: 'not_found', failure: result.failure.kind });
    return;
  }
  const current = draft.get();
  if (!current.base || result.value.version <= current.base.version) return;
  if (isTemplateDraftDirty(current) || current.phase === 'saving') return;
  draft.set({ base: result.value, draft: draftOf(result.value) });
}

async function saveDraft(draft: Draft): Promise<void> {
  const state = draft.get();
  const { base } = state;
  if (
    !base ||
    state.phase === 'saving' ||
    sourceBytes(state.draft) > SHEET_TEMPLATE_SOURCE_MAX_BYTES
  )
    return;
  draft.set({ phase: 'saving', failure: null });
  const { api, campaignId } = draft.scope;
  const result = await api.update(campaignId, base.id, changesOf(base, state.draft));
  if (result.ok) return draft.set({ base: result.value, phase: 'saved', stash: null });
  const phase: DraftPhase = result.failure.kind === 'conflict' ? 'conflict' : 'failed';
  draft.set({ phase, failure: result.failure.kind });
}

function changesOf(base: SheetTemplateDto, draft: TemplateDraft): UpdateSheetTemplateRequestDto {
  const name = draft.name.trim();
  const renamed = name !== '' && name !== base.name;
  const { html, css, js } = draft;
  return { expectedVersion: base.version, ...(renamed ? { name } : {}), html, css, js };
}

// The current version takes the editor; the master's own text waits to be put back.
async function loadCurrent(draft: Draft): Promise<void> {
  const result = await readDetail(draft);
  if (!result.ok) return draft.set({ phase: 'failed', failure: result.failure.kind });
  draft.set((current) => ({
    base: result.value,
    draft: draftOf(result.value),
    stash: current.stash ?? current.draft,
    phase: 'stashed',
    failure: null,
  }));
}

function restoredMine(current: SheetTemplateDraftState): Partial<SheetTemplateDraftState> {
  if (!current.stash) return {};
  return { draft: current.stash, stash: null, phase: 'idle' };
}

function discarded(current: SheetTemplateDraftState): Partial<SheetTemplateDraftState> {
  if (!current.base) return {};
  return { draft: draftOf(current.base), stash: null, phase: 'idle', failure: null };
}

function draftOf(template: SheetTemplateDto): TemplateDraft {
  const { name, html, css, js } = template;
  return { name, html, css, js };
}

function sameDraft(left: TemplateDraft, right: TemplateDraft): boolean {
  return (
    // A blank name is never sent, so it changes nothing.
    left.name === (right.name.trim() || left.name) &&
    left.html === right.html &&
    left.css === right.css &&
    left.js === right.js
  );
}

function loadOfFailure(result: Readonly<{ failure: SheetTemplatesFailure }>): TemplateLoad {
  return result.failure.kind === 'not_found' ? 'not_found' : 'failed';
}
