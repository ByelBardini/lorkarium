import { useEffect, useState } from 'react';

type HeldUrl = Readonly<{ file: Blob | null; url: string | null }>;

const NOTHING: HeldUrl = { file: null, url: null };

/** A `blob:` URL of the file while it is shown, revoked when the file changes or the component
 *  leaves; `null` without a file.
 *
 *  Example: `const src = useObjectUrl(picture)` */
export function useObjectUrl(file: Blob | null): string | null {
  const [held, setHeld] = useState<HeldUrl>(NOTHING);
  // Set while rendering, as React advises for state that follows a prop: no effect to wait for.
  if (held.file !== file) {
    setHeld({ file, url: file === null ? null : URL.createObjectURL(file) });
  }
  const { url } = held;
  useEffect(() => {
    if (url === null) return;
    return () => URL.revokeObjectURL(url);
  }, [url]);
  return held.file === file ? url : null;
}
