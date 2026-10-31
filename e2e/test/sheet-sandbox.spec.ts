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
    channel.port1.onmessage = (event) => channel.port1.postMessage({ type: 'result', requestId: event.data.requestId });
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
async function openHostileSheet(
  page: Page,
  js: string,
  html = '',
  parentPolicy = APP_FRAME_POLICY,
): Promise<string[]> {
  const outside: string[] = [];
  await page.context().route(
    (url) => !url.href.startsWith(HOST_URL),
    (route) => {
      outside.push(route.request().url());
      return route.abort();
    },
  );
  const srcdoc = buildSheetSrcdoc({ html, css: '', js: probeSource(js) });
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
      `<form id="steal" action="${OUTSIDE}/form" method="get"><input name="cookie" value="x"></form>`,
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
      '',
      '',
    );
    await expect(page.getByRole('status')).toHaveText('Ficha recarregada');
    expect(outside).toEqual([`${OUTSIDE}/self`]);
  });
});
