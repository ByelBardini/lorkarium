import { EyeOffIcon } from 'lucide-react';
import type { ReactNode } from 'react';

const CLOSED_FOLDER_PATH =
  'M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z';
const OPEN_FOLDER_BACK_PATH =
  'M4 3h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v1H9.24a3 3 0 0 0-2.6 1.6L2 19V5a2 2 0 0 1 2-2Z';
const OPEN_FOLDER_FRONT_PATH =
  'M9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-1.7-.95L7.5 11.1A2 2 0 0 1 9.24 10Z';

/** A filled folder, open or closed.
 *
 *  Example: `<TreeFolderIcon open={false} />` */
export function TreeFolderIcon({ open }: Readonly<{ open: boolean }>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      {open ? (
        <>
          <path d={OPEN_FOLDER_BACK_PATH} opacity={0.55} />
          <path d={OPEN_FOLDER_FRONT_PATH} />
        </>
      ) : (
        <path d={CLOSED_FOLDER_PATH} />
      )}
    </svg>
  );
}

/** A folder or item icon faded, with the crossed-out eye of something hidden from the players.
 *
 *  Example: `<HiddenItemSeal><MapIcon /></HiddenItemSeal>` */
export function HiddenItemSeal({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <span className="relative mr-1 flex shrink-0">
      <span data-hidden-item-icon="" className="flex opacity-50">
        {children}
      </span>
      <span
        data-hidden-item-seal=""
        className="absolute -right-2 -bottom-1.5 grid size-4 place-items-center rounded-full bg-background"
      >
        <EyeOffIcon aria-hidden="true" strokeWidth={2.5} className="size-3.5! text-primary" />
      </span>
    </span>
  );
}
