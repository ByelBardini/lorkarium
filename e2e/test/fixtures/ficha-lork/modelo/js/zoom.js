/* ---------- zoom da ficha ---------- */
/* Ctrl/⌘ com + (ou =), − e 0, e Ctrl+roda, ampliam só a ficha: a mesa em volta não muda.
   O zoom é de quem olha (como a aba aberta): não vai para os valores, e o frame isolado não
   tem localStorage, então volta a 100% ao abrir de novo. */
const ZOOM_MIN = 0.7;
const ZOOM_MAX = 1.6;
const ZOOM_STEP = 0.1;
let zoomHideT = 0;

function setZoom(next) {
  const z = Math.round(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, next)) * 10) / 10;
  UI.zoom = z;
  // o --zoom compensa as alturas em vh/vw, que o zoom do CSS também multiplica
  document.documentElement.style.setProperty('--zoom', String(z));
  document.documentElement.style.zoom = String(z);
  showZoom(z);
}
function showZoom(z) {
  let pill = document.getElementById('zoom-pill');
  if (!pill) {
    pill = document.createElement('div');
    pill.id = 'zoom-pill';
    pill.setAttribute('role', 'status');
    document.body.append(pill);
  }
  pill.textContent = `Zoom ${Math.round(z * 100)}%`;
  pill.classList.add('on');
  clearTimeout(zoomHideT);
  zoomHideT = setTimeout(() => pill.classList.remove('on'), 1200);
}
const zoomNow = () => UI.zoom || 1;
function zoomKeyOf(e) {
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return null;
  if (e.key === '+' || e.key === '=' || e.code === 'NumpadAdd') return ZOOM_STEP;
  if (e.key === '-' || e.key === '_' || e.code === 'NumpadSubtract') return -ZOOM_STEP;
  if (e.key === '0' || e.code === 'Numpad0') return 0;
  return null;
}
document.addEventListener('keydown', (e) => {
  const step = zoomKeyOf(e);
  if (step === null) return;
  e.preventDefault();
  setZoom(step === 0 ? 1 : zoomNow() + step);
});
document.addEventListener(
  'wheel',
  (e) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    setZoom(zoomNow() + (e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP));
  },
  { passive: false },
);
