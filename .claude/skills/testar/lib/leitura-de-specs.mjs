// Leitura sintática de um spec (Jest ou Vitest): cada it/test com o nome, o
// modificador (skip/only/todo/each), as asserções da cadeia expect(...), os
// valores devolvidos por mocks e quem é "asseguradora" (função local que
// carrega expect por dentro, para o it que a chama não parecer sem asserção).
import fs from 'node:fs';
import path from 'node:path';
import { paraBarras } from '../../refatorar/lib/ambiente.mjs';
import { linhaDe, nomeDoNo } from '../../refatorar/lib/ast.mjs';
import { resolverEspecificador } from './espelho.mjs';

const BASES = {
  it: 'it',
  test: 'it',
  xit: 'it',
  fit: 'it',
  xtest: 'it',
  describe: 'describe',
  xdescribe: 'describe',
  fdescribe: 'describe',
  context: 'describe',
};
const MODIFICADOR_DO_PREFIXO = {
  xit: 'skip',
  xtest: 'skip',
  xdescribe: 'skip',
  fit: 'only',
  fdescribe: 'only',
};
const GANCHOS = new Set(['beforeEach', 'beforeAll', 'afterEach', 'afterAll']);
const DEVOLVEM_VALOR_DE_MOCK = new Set([
  'mockResolvedValue',
  'mockResolvedValueOnce',
  'mockReturnValue',
  'mockReturnValueOnce',
  'mockImplementation',
  'mockImplementationOnce',
]);
const MOCKS_DE_MODULO = new Set(['mock', 'doMock']);
const PREFIXO_DE_ASSEGURADORA = /^(espera|assert|confere|verifica|garante|expect)/i;

export function normalizar(texto) {
  return texto.replace(/\s+/g, ' ').trim();
}

export function lerSpec(ambiente, caminho) {
  const { ts } = ambiente;
  const texto = fs.readFileSync(caminho, 'utf8');
  const tipoDeScript = path.extname(caminho) === '.tsx' ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const fonte = ts.createSourceFile(caminho, texto, ts.ScriptTarget.Latest, true, tipoDeScript);
  const ficha = {
    caminho,
    relativo: paraBarras(path.relative(ambiente.app.raiz, caminho)),
    relativoAoRepo: paraBarras(path.relative(ambiente.repo, caminho)),
    nome: path.basename(caminho),
    linhas: texto.split(/\r?\n/),
    imports: [],
    mocksDeModulo: [],
    describes: [],
    testes: [],
    ganchos: [],
    fakesInline: [],
    asseguradoras: new Set(),
  };
  colherImports(ts, fonte, ficha);
  ficha.importsResolvidos = ficha.imports
    .map((item) => resolverEspecificador(ambiente.app, ficha.relativo, item.especificador))
    .filter(Boolean);
  colherAsseguradoras(ts, fonte, ficha);
  percorrer(ts, fonte, fonte, ficha, []);
  return ficha;
}

function colherImports(ts, fonte, ficha) {
  for (const declaracao of fonte.statements) {
    if (!ts.isImportDeclaration(declaracao)) continue;
    const especificador = declaracao.moduleSpecifier.text;
    const nomes = nomesImportados(ts, declaracao);
    ficha.imports.push({ especificador, nomes, linha: linhaDe(fonte, declaracao.getStart()) });
    if (!especificador.startsWith('.')) continue;
    for (const nome of nomes) if (PREFIXO_DE_ASSEGURADORA.test(nome)) ficha.asseguradoras.add(nome);
  }
}

function nomesImportados(ts, declaracao) {
  const ligacoes = declaracao.importClause?.namedBindings;
  if (!ligacoes || !ts.isNamedImports(ligacoes)) return [];
  return ligacoes.elements.map((elemento) => elemento.name.text);
}

// Função declarada no próprio spec que contém expect: quem a chama assevera.
function colherAsseguradoras(ts, fonte, ficha) {
  const visitar = (no) => {
    const nome = nomeDeFuncaoDeclarada(ts, no);
    if (nome && contemExpect(ts, no)) ficha.asseguradoras.add(nome);
    ts.forEachChild(no, visitar);
  };
  visitar(fonte);
}

function nomeDeFuncaoDeclarada(ts, no) {
  if (ts.isFunctionDeclaration(no)) return no.name?.text ?? null;
  const ehFuncaoAnonima = ts.isArrowFunction(no) || ts.isFunctionExpression(no);
  if (!ehFuncaoAnonima || !ts.isVariableDeclaration(no.parent)) return null;
  return nomeDoNo(ts, no.parent.name);
}

function contemExpect(ts, no) {
  let achou = false;
  const visitar = (filho) => {
    if (achou) return;
    if (ts.isCallExpression(filho) && raizDaCadeiaDeExpect(ts, filho.expression)) achou = true;
    else ts.forEachChild(filho, visitar);
  };
  ts.forEachChild(no, visitar);
  return achou;
}

function percorrer(ts, fonte, no, ficha, pilhaDeDescribes) {
  if (ts.isCallExpression(no)) {
    const chamada = descreverChamada(ts, no.expression);
    if (chamada?.base === 'describe')
      return registrarDescribe(ts, fonte, no, chamada, ficha, pilhaDeDescribes);
    if (chamada?.base === 'it')
      return registrarTeste(ts, fonte, no, chamada, ficha, pilhaDeDescribes);
    if (ts.isIdentifier(no.expression) && GANCHOS.has(no.expression.text))
      return registrarGancho(ts, fonte, no, ficha);
    registrarMockDeModulo(ts, fonte, no, ficha);
  }
  if (ts.isNewExpression(no)) registrarFakeInline(ts, fonte, no, ficha);
  ts.forEachChild(no, (filho) => percorrer(ts, fonte, filho, ficha, pilhaDeDescribes));
}

// it | it.skip | it.each([...]) | xit | describe.only → { base, modificadores }
function descreverChamada(ts, expressao) {
  const modificadores = [];
  let atual = expressao;
  if (
    ts.isCallExpression(atual) &&
    ts.isPropertyAccessExpression(atual.expression) &&
    atual.expression.name.text === 'each'
  ) {
    modificadores.push('each');
    atual = atual.expression.expression;
  }
  while (ts.isPropertyAccessExpression(atual)) {
    modificadores.push(atual.name.text);
    atual = atual.expression;
  }
  if (!ts.isIdentifier(atual) || !BASES[atual.text]) return null;
  const doPrefixo = MODIFICADOR_DO_PREFIXO[atual.text];
  if (doPrefixo) modificadores.push(doPrefixo);
  return { base: BASES[atual.text], modificadores };
}

function nomeDoBloco(ts, argumento) {
  if (!argumento) return '';
  if (ts.isStringLiteralLike(argumento)) return argumento.text;
  if (ts.isTemplateExpression(argumento)) return normalizar(argumento.getText());
  return normalizar(argumento.getText());
}

function registrarDescribe(ts, fonte, no, chamada, ficha, pilha) {
  const describe = {
    nome: nomeDoBloco(ts, no.arguments[0]),
    linha: linhaDe(fonte, no.getStart()),
    modificadores: chamada.modificadores,
    testes: 0,
    pai: pilha.at(-1) ?? null,
  };
  ficha.describes.push(describe);
  const corpo = no.arguments[1];
  if (corpo)
    ts.forEachChild(corpo, (filho) => percorrer(ts, fonte, filho, ficha, [...pilha, describe]));
}

function registrarTeste(ts, fonte, no, chamada, ficha, pilha) {
  const corpo = no.arguments[1];
  const linha = linhaDe(fonte, no.getStart());
  const teste = {
    nome: nomeDoBloco(ts, no.arguments[0]),
    linha,
    linhaFinal: linhaDe(fonte, no.getEnd()),
    modificadores: chamada.modificadores,
    describe: pilha.at(-1) ?? null,
    comentarios: comentariosDoTeste(ts, fonte, no),
    expects: [],
    valoresDeMock: [],
    chamaAsseguradora: false,
  };
  for (const describe of pilha) describe.testes += 1;
  if (corpo) colherCorpo(ts, fonte, corpo, teste, ficha);
  ficha.testes.push(teste);
}

function comentariosDoTeste(ts, fonte, no) {
  const texto = fonte.getFullText();
  const faixas = ts.getLeadingCommentRanges(texto, no.getFullStart()) ?? [];
  const antes = faixas.map((faixa) => texto.slice(faixa.pos, faixa.end));
  const dentro = no
    .getText()
    .split(/\r?\n/)
    .filter((l) => /^\s*(\/\/|\/\*|\*)/.test(l));
  return [...antes, ...dentro].join('\n');
}

function colherCorpo(ts, fonte, corpo, teste, ficha) {
  const visitar = (no) => {
    if (ts.isCallExpression(no)) {
      const expect = descreverExpect(ts, fonte, no);
      if (expect) teste.expects.push(expect);
      const valor = valorDeMock(ts, no);
      if (valor) teste.valoresDeMock.push(valor);
      if (ts.isIdentifier(no.expression) && ficha.asseguradoras.has(no.expression.text))
        teste.chamaAsseguradora = true;
    }
    if (ts.isNewExpression(no)) registrarFakeInline(ts, fonte, no, ficha);
    ts.forEachChild(no, visitar);
  };
  ts.forEachChild(corpo, visitar);
}

function registrarGancho(ts, fonte, no, ficha) {
  const corpo = no.arguments[0];
  const gancho = {
    nome: no.expression.text,
    linha: linhaDe(fonte, no.getStart()),
    valoresDeMock: [],
  };
  const visitar = (filho) => {
    if (ts.isCallExpression(filho)) {
      const valor = valorDeMock(ts, filho);
      if (valor) gancho.valoresDeMock.push(valor);
    }
    if (ts.isNewExpression(filho)) registrarFakeInline(ts, fonte, filho, ficha);
    ts.forEachChild(filho, visitar);
  };
  if (corpo) ts.forEachChild(corpo, visitar);
  ficha.ganchos.push(gancho);
}

// expect(x).not.resolves.toBe(y) → { matcher: 'toBe', negado, alvo: 'x', argumento: 'y' }
function descreverExpect(ts, fonte, no) {
  if (!ts.isPropertyAccessExpression(no.expression)) return null;
  const raiz = raizDaCadeiaDeExpect(ts, no.expression);
  if (!raiz) return null;
  const elos = raiz.elos;
  return {
    linha: linhaDe(fonte, no.getStart()),
    matcher: elos.at(-1),
    negado: elos.includes('not'),
    estatico: raiz.estatico,
    alvo: raiz.chamada ? normalizar(raiz.chamada.arguments[0]?.getText() ?? '') : '',
    argumento: normalizar(no.arguments[0]?.getText() ?? ''),
  };
}

function raizDaCadeiaDeExpect(ts, expressao) {
  const elos = [];
  let atual = expressao;
  while (ts.isPropertyAccessExpression(atual)) {
    elos.unshift(atual.name.text);
    atual = atual.expression;
  }
  const ehChamadaDeExpect =
    ts.isCallExpression(atual) &&
    ts.isIdentifier(atual.expression) &&
    /^expect(TypeOf)?$/.test(atual.expression.text);
  if (ehChamadaDeExpect && elos.length > 0) return { chamada: atual, elos, estatico: false };
  if (ts.isIdentifier(atual) && atual.text === 'expect' && elos.length > 0)
    return { chamada: null, elos, estatico: true };
  return null;
}

function valorDeMock(ts, no) {
  if (
    !ts.isPropertyAccessExpression(no.expression) ||
    !DEVOLVEM_VALOR_DE_MOCK.has(no.expression.name.text)
  )
    return null;
  const argumento = no.arguments[0];
  if (!argumento) return null;
  if (!no.expression.name.text.startsWith('mockImplementation'))
    return normalizar(argumento.getText());
  const ehSetaComExpressao = ts.isArrowFunction(argumento) && !ts.isBlock(argumento.body);
  return ehSetaComExpressao ? normalizar(argumento.body.getText()) : null;
}

function registrarMockDeModulo(ts, fonte, no, ficha) {
  const callee = no.expression;
  if (!ts.isPropertyAccessExpression(callee) || !MOCKS_DE_MODULO.has(callee.name.text)) return;
  if (!ts.isIdentifier(callee.expression) || !/^(vi|jest)$/.test(callee.expression.text)) return;
  const especificador = no.arguments[0];
  if (!especificador || !ts.isStringLiteralLike(especificador)) return;
  ficha.mocksDeModulo.push({
    especificador: especificador.text,
    linha: linhaDe(fonte, no.getStart()),
  });
}

// new Service({ buscar: jest.fn() }): dependência falsa montada inline.
function registrarFakeInline(ts, fonte, no, ficha) {
  for (const argumento of no.arguments ?? []) {
    if (!ts.isObjectLiteralExpression(argumento)) continue;
    if (!/\b(jest|vi)\.fn\(/.test(argumento.getText())) continue;
    const linha = linhaDe(fonte, argumento.getStart());
    if (!ficha.fakesInline.some((item) => item.linha === linha)) ficha.fakesInline.push({ linha });
  }
}
