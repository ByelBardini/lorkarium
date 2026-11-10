import {
  SHEET_TEMPLATE_SOURCE_MAX_BYTES,
  type SheetTemplateDto,
  type SheetTemplateManifestDto,
  type UpdateSheetTemplateRequestDto,
} from '@lorkarium/contracts';
import { createStore, type StoreApi } from 'zustand/vanilla';
import {
  sameTemplateFiles,
  templateFilesBytes,
  type TemplateFile,
} from '@/lib/sheet-template-files';
import { readSheetManifestText, sheetManifestText } from '@/lib/sheet-template-manifest';
import type {
  SheetTemplatesApi,
  SheetTemplatesFailure,
  SheetTemplatesResult,
} from '@/services/sheet-templates-api';

/** What the master is typing: the name, the files in order and the manifest as JSON text. */
export type TemplateDraft = Readonly<{
  name: string;
  files: readonly TemplateFile[];
  manifest: string;
}>;

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

const EMPTY: TemplateDraft = { name: '', files: [], manifest: '' };
const LOADING = {
  load: 'loading',
  base: null,
  draft: EMPTY,
  phase: 'idle',
  failure: null,
  stash: null,
} as const;
/** The UTF-8 bytes of every file, the measure of `SHEET_TEMPLATE_SOURCE_MAX_BYTES`.
 *
 *  Example: `sourceBytes({ files: [{ path: 'index.html', content: 'é' }] }) // 2` */
export function sourceBytes(draft: Pick<TemplateDraft, 'files'>): number {
  return templateFilesBytes(draft.files);
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

// Nothing is sent while saving, past the budget or with a manifest the contract refuses.
function savableManifest(state: SheetTemplateDraftState): SheetTemplateManifestDto | null {
  if (state.phase === 'saving' || sourceBytes(state.draft) > SHEET_TEMPLATE_SOURCE_MAX_BYTES)
    return null;
  const reading = readSheetManifestText(state.draft.manifest);
  return reading.ok ? reading.manifest : null;
}

async function saveDraft(draft: Draft): Promise<void> {
  const state = draft.get();
  const { base } = state;
  const manifest = savableManifest(state);
  if (!base || !manifest) return;
  draft.set({ phase: 'saving', failure: null });
  const { api, campaignId } = draft.scope;
  const changes = changesOf(base, state.draft, manifest);
  const result = await api.update(campaignId, base.id, changes);
  if (result.ok) return draft.set({ base: result.value, phase: 'saved', stash: null });
  const phase: DraftPhase = result.failure.kind === 'conflict' ? 'conflict' : 'failed';
  draft.set({ phase, failure: result.failure.kind });
}

function changesOf(
  base: SheetTemplateDto,
  draft: TemplateDraft,
  manifest: SheetTemplateManifestDto,
): UpdateSheetTemplateRequestDto {
  const name = draft.name.trim();
  const renamed = name !== '' && name !== base.name;
  const files = draft.files.map(({ path, content }) => ({ path, content }));
  return { expectedVersion: base.version, ...(renamed ? { name } : {}), files, manifest };
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
  const { name, files } = template;
  return { name, files, manifest: sheetManifestText(template.manifest) };
}

function sameDraft(left: TemplateDraft, right: TemplateDraft): boolean {
  return (
    // A blank name is never sent, so it changes nothing.
    left.name === (right.name.trim() || left.name) &&
    sameTemplateFiles(left.files, right.files) &&
    left.manifest === right.manifest
  );
}

function loadOfFailure(result: Readonly<{ failure: SheetTemplatesFailure }>): TemplateLoad {
  return result.failure.kind === 'not_found' ? 'not_found' : 'failed';
}
