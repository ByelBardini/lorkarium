import { useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react';

export type DraftFieldOptions = Readonly<{
  /** What the server confirmed, as the field shows it. */
  confirmed: string;
  /** What may be typed (the CA keeps only digits); the text as typed when absent. */
  normalize?: (typed: string) => string;
  /** Sends the draft; answers whether the server confirmed it. */
  save: (draft: string) => Promise<boolean>;
}>;

export type DraftFieldBinding = Readonly<{
  value: string;
  onFocus: () => void;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onBlur: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
}>;

type Draft = Readonly<{ base: string; text: string }>;

/** A field over a confirmed value (the member card, a grid's name): while it has focus the text is a local draft that nobody else's event
 *  overwrites; Enter or leaving the field sends it (only when it changed), Esc puts back what
 *  the server confirmed. After the send, a refusal shows the confirmed value again.
 *
 *  Example: `<input {...useDraftField({ confirmed: '15', save })} />` */
export function useDraftField({
  confirmed,
  normalize,
  save,
}: DraftFieldOptions): DraftFieldBinding {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [sending, setSending] = useState<string | null>(null);
  const cancelled = useRef(false);
  const commit = (current: Draft | null): void => {
    setDraft(null);
    const skip = cancelled.current || !current || current.text === current.base;
    cancelled.current = false;
    if (skip || !current) return;
    setSending(current.text);
    void save(current.text).finally(() => setSending(null));
  };
  return {
    value: draft?.text ?? sending ?? confirmed,
    onFocus: () => setDraft((open) => open ?? { base: confirmed, text: confirmed }),
    onChange: (event) => {
      const text = normalize ? normalize(event.target.value) : event.target.value;
      setDraft((open) => ({ base: open?.base ?? confirmed, text }));
    },
    onBlur: () => commit(draft),
    onKeyDown: (event) => keyOnField(event, cancelled),
  };
}

function keyOnField(event: KeyboardEvent<HTMLInputElement>, cancelled: { current: boolean }): void {
  if (event.key !== 'Enter' && event.key !== 'Escape') return;
  event.preventDefault();
  cancelled.current = event.key === 'Escape';
  event.currentTarget.blur();
}
