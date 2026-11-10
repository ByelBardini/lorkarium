/* ---------- Regras ---------- */
/* o texto das regras mora em paginas/regras.html; aqui só se lê qual vale para o próximo nível
   e em que faixa de "caído" o HP está */
function ruleHolds(li, n) {
  if (li.hasAttribute('data-odd')) return n % 2 === 1;
  if (li.hasAttribute('data-even')) return n % 2 === 0;
  return n % num(li.dataset.every || 1) === 0;
}
function calcNextLevel() {
  const next = level() + 1;
  const gains = [...document.querySelectorAll('#level-rules li')].filter((li) =>
    ruleHolds(li, next),
  );
  const line = (li) => {
    const txt = li.querySelector('span').textContent;
    return `<li style="${li.getAttribute('style') || ''}">${esc(txt.charAt(0).toUpperCase() + txt.slice(1))}</li>`;
  };
  document.getElementById('next-lv').innerHTML =
    `<p class="next-hd"><span class="eyebrow">Próximo nível</span><b>${next}</b></p><ul>${gains.map(line).join('')}</ul>`;
}
function calcFall() {
  const hp = tableBar('HP');
  const rows = [...document.querySelectorAll('[data-fall]')];
  const marks = rows.map((li) => -Math.ceil(Number(li.dataset.share) * (hp ? hp.max : 0)));
  const here =
    !hp || hp.current > 0 ? -1 : marks.reduce((at, m, i) => (hp.current <= m ? i : at), -1);
  rows.forEach((li, i) => {
    li.querySelector('.thr').textContent = i === 0 ? 'HP 0' : `HP ≤ ${marks[i]}`.replace('-', '−');
    li.classList.toggle('here', i === here);
  });
}
function calcRules() {
  calcNextLevel();
  calcFall();
}
