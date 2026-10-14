import { achado } from './achados.mjs';

const CATEGORIA = 'duplicacao';
const JANELA = 6;
const LINHAS_PARA_AVISO = 10;
// Nomes que a convenção repete de propósito (export de rota do React Router,
// entrada de processo, ganchos do Fastify): o mesmo nome não é cópia.
const NOMES_CONVENCIONAIS = new Set([
  'default',
  'loader',
  'action',
  'clientLoader',
  'clientAction',
  'ErrorBoundary',
  'Component',
  'Layout',
  'meta',
  'constructor',
  'main',
  'bootstrap',
  'buildApp',
  'onRequest',
  'preHandler',
  'onClose',
]);

export function analisarDuplicacao(contexto) {
  return [
    ...blocosDuplicados(contexto),
    ...funcoesHomonimas(contexto),
    ...tiposComMesmosMembros(contexto),
  ];
}

// Clones exatos a menos de espaço, literais e números: cada janela de JANELA
// linhas significativas vira uma chave; janelas iguais em dois lugares são
// estendidas linha a linha até divergirem.
function blocosDuplicados(contexto) {
  const documentos = [...contexto.fichas.values()]
    .filter((ficha) => !ficha.gerado && (!ficha.ehTeste || contexto.alvoIncluiTestes))
    .map((ficha) => ({ ficha, linhas: linhasSignificativas(ficha) }))
    .filter((doc) => doc.linhas.length >= JANELA);
  const porChave = indexarJanelas(documentos);
  const pares = estenderPares(porChave, documentos);
  return agruparPorAncora(contexto, pares);
}

function linhasSignificativas(ficha) {
  const linhas = [];
  ficha.textoSemImports.split('\n').forEach((bruta, indice) => {
    const normalizada = normalizar(bruta);
    if (normalizada) linhas.push({ texto: normalizada, numero: indice + 1 });
  });
  return linhas;
}

function normalizar(linha) {
  const compacta = linha.trim().replace(/\s+/g, ' ');
  if (
    compacta === '' ||
    /^(import|export)\b.*\bfrom\b/.test(compacta) ||
    /^import\s/.test(compacta)
  )
    return null;
  const semLiterais = compacta
    .replace(/`(?:[^`\\]|\\.)*`/g, '"S"')
    .replace(/"(?:[^"\\]|\\.)*"/g, '"S"')
    .replace(/'(?:[^'\\]|\\.)*'/g, '"S"')
    .replace(/\b\d+(\.\d+)?\b/g, 'N');
  return /[A-Za-z]{2,}/.test(semLiterais) && semLiterais.length >= 6 ? semLiterais : null;
}

function indexarJanelas(documentos) {
  const porChave = new Map();
  documentos.forEach((doc, docIndice) => {
    for (let inicio = 0; inicio + JANELA <= doc.linhas.length; inicio += 1) {
      const chave = doc.linhas
        .slice(inicio, inicio + JANELA)
        .map((l) => l.texto)
        .join('\n');
      if (!porChave.has(chave)) porChave.set(chave, []);
      porChave.get(chave).push({ docIndice, inicio });
    }
  });
  return porChave;
}

function chaveDaJanela(doc, inicio) {
  if (inicio + JANELA > doc.linhas.length) return null;
  return doc.linhas
    .slice(inicio, inicio + JANELA)
    .map((l) => l.texto)
    .join('\n');
}

function estenderPares(porChave, documentos) {
  const cobertos = new Set();
  const pares = [];
  for (const ocorrencias of porChave.values()) {
    if (ocorrencias.length < 2) continue;
    for (let i = 0; i < ocorrencias.length; i += 1) {
      for (let j = i + 1; j < ocorrencias.length; j += 1) {
        const par = estenderPar(ocorrencias[i], ocorrencias[j], documentos, cobertos);
        if (par) pares.push(par);
      }
    }
  }
  return pares;
}

function estenderPar(a, b, documentos, cobertos) {
  const marca = `${a.docIndice}:${a.inicio}|${b.docIndice}:${b.inicio}`;
  if (cobertos.has(marca)) return null;
  if (a.docIndice === b.docIndice && Math.abs(a.inicio - b.inicio) < JANELA) return null;
  const docA = documentos[a.docIndice];
  const docB = documentos[b.docIndice];
  let comprimento = JANELA;
  let passo = 0;
  while (true) {
    cobertos.add(`${a.docIndice}:${a.inicio + passo}|${b.docIndice}:${b.inicio + passo}`);
    passo += 1;
    const proximaA = chaveDaJanela(docA, a.inicio + passo);
    const proximaB = chaveDaJanela(docB, b.inicio + passo);
    if (proximaA === null || proximaB === null || proximaA !== proximaB) break;
    comprimento += 1;
  }
  return { a: { doc: docA, inicio: a.inicio }, b: { doc: docB, inicio: b.inicio }, comprimento };
}

function faixa(ocorrencia, comprimento) {
  const { doc, inicio } = ocorrencia;
  return {
    ficha: doc.ficha,
    linha: doc.linhas[inicio].numero,
    linhaFim: doc.linhas[inicio + comprimento - 1].numero,
  };
}

function agruparPorAncora(contexto, pares) {
  const grupos = new Map();
  for (const par of pares) {
    const lados = [faixa(par.a, par.comprimento), faixa(par.b, par.comprimento)];
    const noAlvo = lados.filter((lado) => contexto.ehDoAlvo(lado.ficha));
    if (noAlvo.length === 0) continue;
    const ancora = noAlvo[0];
    const chave = `${ancora.ficha.caminho}:${ancora.linha}:${par.comprimento}`;
    if (!grupos.has(chave))
      grupos.set(chave, { ancora, comprimento: par.comprimento, parceiros: [] });
    grupos.get(chave).parceiros.push(lados.find((lado) => lado !== ancora));
  }
  return [...grupos.values()].map((grupo) => {
    const onde = grupo.parceiros
      .map((p) => `${p.ficha.relativoAoRepo}:${p.linha}-${p.linhaFim}`)
      .join(', ');
    const severidade = grupo.comprimento >= LINHAS_PARA_AVISO ? 'aviso' : 'info';
    return achado(
      CATEGORIA,
      'bloco-duplicado',
      severidade,
      grupo.ancora.ficha,
      grupo.ancora.linha,
      `${grupo.comprimento} linhas iguais (até a linha ${grupo.ancora.linhaFim}) também em ${onde}`,
      'extrair para uma função com nome e um teste; deixar uma cópia só',
    );
  });
}

function funcoesHomonimas(contexto) {
  const porNome = new Map();
  for (const ficha of contexto.fichas.values()) {
    if (ficha.gerado || ficha.ehTeste) continue;
    for (const funcao of ficha.funcoes) {
      if (!funcao.nome || !funcao.deModulo || NOMES_CONVENCIONAIS.has(funcao.nome)) continue;
      if (!porNome.has(funcao.nome)) porNome.set(funcao.nome, []);
      porNome.get(funcao.nome).push({ ficha, linha: funcao.linha });
    }
  }
  const achados = [];
  for (const [nome, lugares] of porNome) {
    const arquivos = new Set(lugares.map((l) => l.ficha.caminho));
    if (arquivos.size < 2) continue;
    const doAlvo = lugares.find((l) => contexto.ehDoAlvo(l.ficha));
    if (!doAlvo) continue;
    const outros = lugares
      .filter((l) => l.ficha !== doAlvo.ficha)
      .map((l) => `${l.ficha.relativoAoRepo}:${l.linha}`);
    achados.push(
      achado(
        CATEGORIA,
        'funcao-homonima',
        'info',
        doAlvo.ficha,
        doAlvo.linha,
        `\`${nome}\` também é definida em ${listaCurta(outros)}`,
        'se fazem a mesma coisa, sobra uma; se não, o nome de uma delas está genérico',
      ),
    );
  }
  return achados;
}

function listaCurta(itens, maximo = 6) {
  if (itens.length <= maximo) return itens.join(', ');
  return `${itens.slice(0, maximo).join(', ')} (+${itens.length - maximo})`;
}

function tiposComMesmosMembros(contexto) {
  const porAssinatura = new Map();
  for (const ficha of contexto.fichas.values()) {
    if (ficha.gerado || (ficha.ehTeste && !contexto.alvoIncluiTestes)) continue;
    for (const tipo of ficha.tipos) {
      const assinatura = tipo.membros.join(',');
      if (!porAssinatura.has(assinatura)) porAssinatura.set(assinatura, []);
      porAssinatura.get(assinatura).push({ ficha, ...tipo });
    }
  }
  const achados = [];
  for (const lugares of porAssinatura.values()) {
    const arquivos = new Set(lugares.map((l) => l.ficha.caminho));
    if (arquivos.size < 2) continue;
    const doAlvo = lugares.find((l) => contexto.ehDoAlvo(l.ficha));
    if (!doAlvo) continue;
    const outros = lugares
      .filter((l) => l.ficha !== doAlvo.ficha)
      .map((l) => `${l.nome} (${l.ficha.relativoAoRepo}:${l.linha})`);
    achados.push(
      achado(
        CATEGORIA,
        'tipo-com-mesmos-membros',
        'info',
        doAlvo.ficha,
        doAlvo.linha,
        `\`${doAlvo.nome}\` tem os mesmos ${doAlvo.membros.length} membros de ${listaCurta(outros)}`,
        'um tipo só, importado dos dois lados',
      ),
    );
  }
  return achados;
}
