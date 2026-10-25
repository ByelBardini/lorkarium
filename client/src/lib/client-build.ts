const BUILD_FILES =
  'script[type="module"][src^="/assets/"], link[rel="stylesheet"][href^="/assets/"]';

/** Which build of the client a page is: the hashed entry files its `index.html` loads, sorted and
 *  joined. Rolldown hashes the entry with everything it imports, so any change to the client
 *  moves it; a server-only deploy keeps it. `''` when there is no build (the Vite dev server
 *  serves `/src/main.tsx`). Read the running page at boot: lazy routes add more `/assets/` links.
 *
 *  Example: `buildFingerprintOf(document)` → `'/assets/index-B1x.css /assets/index-Dq9.js'` */
export function buildFingerprintOf(page: ParentNode): string {
  const files = Array.from(page.querySelectorAll(BUILD_FILES), (element) =>
    element.getAttribute(element.tagName === 'SCRIPT' ? 'src' : 'href'),
  );
  return files
    .filter((file): file is string => file !== null)
    .sort()
    .join(' ');
}
