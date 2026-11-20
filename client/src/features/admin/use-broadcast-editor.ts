import type { MailBroadcastContentDto, MailBroadcastDto } from '@lorkarium/contracts';
import { useEffect, useState } from 'react';
import type { BroadcastsApi, BroadcastsFailure } from '@/services/broadcasts-api';
import { contentCheckOf, type BroadcastFields } from './broadcast-messages';
import { segmentOf } from './broadcast-view';

export const EMPTY_BROADCAST: BroadcastFields = {
  choice: 'all',
  subject: '',
  title: '',
  text: '',
  buttonLabel: '',
  buttonHref: '',
};

/** The last thing the editor did, for the line under the buttons. */
export type BroadcastEditorStatus =
  | Readonly<{ kind: 'idle' }>
  | Readonly<{ kind: 'busy'; action: 'preview' | 'test' | 'confirm' }>
  | Readonly<{ kind: 'tested'; to: string }>
  | Readonly<{ kind: 'confirmed'; total: number }>
  | Readonly<{ kind: 'invalid'; message: string }>
  | Readonly<{ kind: 'failed'; failure: BroadcastsFailure }>;

type Draft = Readonly<{ id: string; tested: string | null }>;

export type BroadcastEditor = Readonly<{
  fields: BroadcastFields;
  change: (patch: Partial<BroadcastFields>) => void;
  audience: number | null;
  previewHtml: string | null;
  status: BroadcastEditorStatus;
  /** The draft was tested with exactly the text on screen now. */
  tested: boolean;
  showPreview: () => Promise<void>;
  sendTest: () => Promise<void>;
  confirm: (total: number) => Promise<void>;
}>;

type EditorState = Readonly<{
  api: BroadcastsApi;
  draft: Draft | null;
  setDraft: (draft: Draft | null) => void;
  setStatus: (status: BroadcastEditorStatus) => void;
}>;

/** The editor of a notice: the audience follows the segment, the test saves the draft first
 *  (and a later edit asks for a new test), the confirmation hands the notice to `onConfirmed`.
 *
 *  Example: `const editor = useBroadcastEditor(api, (sent) => setList([sent, ...list]))` */
export function useBroadcastEditor(
  api: BroadcastsApi,
  onConfirmed: (broadcast: MailBroadcastDto) => void,
): BroadcastEditor {
  const [fields, setFields] = useState(EMPTY_BROADCAST);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [status, setStatus] = useState<BroadcastEditorStatus>({ kind: 'idle' });
  const [audience, refreshAudience] = useAudience(api, fields);
  const state: EditorState = { api, draft, setDraft, setStatus };
  const checked = contentCheckOf(fields);
  const confirmed = (broadcast: MailBroadcastDto): void => {
    onConfirmed(broadcast);
    setFields(EMPTY_BROADCAST);
    setPreviewHtml(null);
  };
  return {
    ...{ fields, audience, previewHtml, status },
    change: (patch) => setFields({ ...fields, ...patch }),
    tested: testedAsShown(draft, checked),
    showPreview: runner(setStatus)('preview', checked, previewWork(state, setPreviewHtml)),
    sendTest: runner(setStatus)('test', checked, testWork(state)),
    confirm: confirmWork(state, confirmed, refreshAudience),
  };
}

// The draft was tested with exactly the valid text on screen.
function testedAsShown(draft: Draft | null, checked: ReturnType<typeof contentCheckOf>): boolean {
  if (!draft?.tested || !checked.ok) return false;
  return draft.tested === JSON.stringify(checked.content);
}

function previewWork(state: EditorState, show: (html: string) => void): Work {
  return async (content) => {
    const result = await state.api.preview(content);
    if (!result.ok) return state.setStatus({ kind: 'failed', failure: result.failure });
    show(result.value.html);
    state.setStatus({ kind: 'idle' });
  };
}

// The draft is saved (created once, rewritten after) and only then tested.
function testWork({ api, draft, setDraft, setStatus }: EditorState): Work {
  return async (content) => {
    const saved = draft ? await api.rewrite(draft.id, content) : await api.create(content);
    if (!saved.ok) return setStatus({ kind: 'failed', failure: saved.failure });
    const id = saved.value.broadcast.id;
    setDraft({ id, tested: null });
    const result = await api.sendTest(id);
    if (!result.ok) return setStatus({ kind: 'failed', failure: result.failure });
    setDraft({ id, tested: JSON.stringify(content) });
    setStatus({ kind: 'tested', to: result.value.to });
  };
}

function confirmWork(
  { api, draft, setDraft, setStatus }: EditorState,
  confirmed: (broadcast: MailBroadcastDto) => void,
  refreshAudience: () => void,
): (total: number) => Promise<void> {
  return async (total) => {
    if (!draft) return;
    setStatus({ kind: 'busy', action: 'confirm' });
    const result = await api.confirm(draft.id, total);
    if (!result.ok) {
      if (result.failure.kind === 'confirmation_mismatch') refreshAudience();
      return setStatus({ kind: 'failed', failure: result.failure });
    }
    confirmed(result.value);
    setDraft(null);
    setStatus({ kind: 'confirmed', total });
  };
}

type Work = (content: MailBroadcastContentDto) => Promise<void>;

// A command that needs a valid text: an invalid one says what to fix and sends nothing.
function runner(setStatus: (status: BroadcastEditorStatus) => void) {
  return (action: 'preview' | 'test', checked: ReturnType<typeof contentCheckOf>, work: Work) =>
    async (): Promise<void> => {
      if (!checked.ok) return setStatus({ kind: 'invalid', message: checked.message });
      setStatus({ kind: 'busy', action });
      await work(checked.content);
    };
}

// The count of the chosen segment now; `refresh` asks again (after the audience changed).
function useAudience(api: BroadcastsApi, fields: BroadcastFields): [number | null, () => void] {
  const [audience, setAudience] = useState<number | null>(null);
  const [round, setRound] = useState(0);
  useEffect(() => {
    let current = true;
    void api.audience(segmentOf(fields.choice)).then((result) => {
      if (current) setAudience(result.ok ? result.value : null);
    });
    return () => {
      current = false;
    };
  }, [api, fields.choice, round]);
  return [audience, () => setRound((value) => value + 1)];
}
