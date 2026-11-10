/* ---------- texto rico ---------- */
/* o HTML guardado e o colado passam por lorkarium.html.sanitize: a mesma lista de tags dos
   botões abaixo. Imagem vai no espaço "Adicionar imagem" de cada entrada, não no texto. */
const COLORS = [
  ['Padrão', '#eae5da'],
  ['Ouro', '#e2c793'],
  ['Brasa', '#e6a28f'],
  ['Musgo', '#a9d1b4'],
  ['Aço', '#aebcd6'],
  ['Âmbar', '#e0a05a'],
  ['Violeta', '#b29ad6'],
  ['Apagado', '#a9a497'],
];
const TOOLS = [
  ['bold', '<b>B</b>', 'Negrito'],
  ['italic', '<i class="serif">I</i>', 'Itálico'],
  ['underline', '<u>U</u>', 'Sublinhado'],
  '|',
  ['h4', '<span class="serif">Título</span>', 'Subtítulo'],
  ['blockquote', ic('quote'), 'Citação'],
  ['insertUnorderedList', ic('list'), 'Lista'],
  '|',
  ['justifyLeft', ic('left'), 'Alinhar à esquerda'],
  ['justifyCenter', ic('center'), 'Centralizar'],
  '|',
  ['color', '<span class="cur-sw" id="cur-sw"></span>', 'Cor do texto'],
  ['insertHorizontalRule', ic('rule'), 'Divisor'],
  ['removeFormat', ic('clear'), 'Limpar formatação'],
];
const PRESSABLE = ['bold', 'italic', 'underline', 'insertUnorderedList'];
function renderToolbar() {
  const bar = document.getElementById('rtbar');
  bar.innerHTML = TOOLS.map((t) =>
    t === '|'
      ? '<span class="sep"></span>'
      : `<button type="button" class="tb" data-cmd="${t[0]}" title="${t[2]}" aria-label="${t[2]}" ${PRESSABLE.includes(t[0]) ? 'aria-pressed="false"' : ''}>${t[1]}</button>`,
  ).join('');
  bar.insertAdjacentHTML(
    'beforeend',
    `<div class="swatches" id="swatches">${COLORS.map(([n, c]) => `<button type="button" class="sw" data-color="${c}" title="${n}" aria-label="Cor: ${n}" style="--sw:${c}"></button>`).join('')}</div>`,
  );
}
let activeEd = null;
let savedRange = null;
function keepRange() {
  const s = getSelection();
  if (s && s.rangeCount && activeEd && activeEd.contains(s.anchorNode))
    savedRange = s.getRangeAt(0).cloneRange();
}
function restoreRange() {
  if (!activeEd) return;
  activeEd.focus();
  const s = getSelection();
  if (!savedRange || !s) return;
  s.removeAllRanges();
  s.addRange(savedRange);
}
/* execCommand é obsoleto, mas é o que edita contenteditable sem biblioteca; falha sem quebrar */
function exec(cmd, val) {
  try {
    return document.execCommand(cmd, false, val);
  } catch (e) {
    return false;
  }
}
function query(fn, cmd) {
  try {
    return document[fn](cmd);
  } catch (e) {
    return fn === 'queryCommandState' ? false : '';
  }
}
function runCmd(cmd, val) {
  restoreRange();
  exec('styleWithCSS', true);
  const block = String(query('queryCommandValue', 'formatBlock') || '').toLowerCase();
  if (cmd === 'h4' || cmd === 'blockquote') exec('formatBlock', block === cmd ? 'p' : cmd);
  else exec(cmd, val);
  keepRange();
  syncToolbar();
}
function syncToolbar() {
  if (!activeEd) return;
  document
    .querySelectorAll('#rtbar [aria-pressed]')
    .forEach((b) =>
      b.setAttribute('aria-pressed', String(!!query('queryCommandState', b.dataset.cmd))),
    );
  const sw = document.getElementById('cur-sw');
  if (sw) sw.style.setProperty('--sw', query('queryCommandValue', 'foreColor') || '#eae5da');
}
function markEmpty(ed) {
  ed.classList.toggle('empty', !ed.textContent.trim() && !ed.querySelector('hr'));
}
/* o campo com foco não é sobrescrito: o state que volta da própria edição chegaria no meio */
function paintRich(root) {
  root.querySelectorAll('[data-rt]').forEach((ed) => {
    if (ed === activeEd && document.activeElement === ed) return;
    const html = lorkarium.html.sanitize(String(getP(ed.dataset.rt) || ''));
    if (ed.dataset.shown !== html) {
      ed.innerHTML = html;
      ed.dataset.shown = html;
    }
    markEmpty(ed);
  });
}
function saveRich(ed) {
  markEmpty(ed);
  const html = ed.classList.contains('empty') ? '' : lorkarium.html.sanitize(ed.innerHTML);
  ed.dataset.shown = html;
  patch(ed.dataset.rt, html || null);
}
function pasteInto(e) {
  const dt = e.clipboardData;
  if (!dt) return;
  e.preventDefault();
  if ([...dt.files].some((f) => f.type.startsWith('image/'))) {
    setStatus('Para imagens, use o “Adicionar imagem” da entrada.');
    return;
  }
  const html = dt.getData('text/html');
  if (!html) exec('insertText', dt.getData('text/plain'));
  else exec('insertHTML', lorkarium.html.sanitize(html));
}
/* campo vazio ganha um <p> ao focar: sem ele a 1ª linha fica texto solto e o espaçamento difere */
function primeEmpty(ed) {
  if (ed.innerHTML.trim()) return;
  ed.innerHTML = '<p><br></p>';
  const r = document.createRange();
  r.setStart(ed.firstChild, 0);
  r.collapse(true);
  const s = getSelection();
  if (!s) return;
  s.removeAllRanges();
  s.addRange(r);
}
