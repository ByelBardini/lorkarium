// Leitura sintática do TypeScript (sem type-checker): o que cada regra precisa
// saber de uma função, classe, export ou comentário sai daqui.

const CONECTIVOS_LOGICOS = new Set(['&&', '||', '??']);

export function linhaDe(fonte, posicao) {
  return fonte.getLineAndCharacterOfPosition(posicao).line + 1;
}

export function nomeDoNo(ts, no) {
  if (!no) return null;
  if (ts.isIdentifier(no) || ts.isPrivateIdentifier(no)) return no.text;
  if (ts.isStringLiteral(no)) return no.text;
  return null;
}

export function ehFuncao(ts, no) {
  return (
    ts.isFunctionDeclaration(no) ||
    ts.isFunctionExpression(no) ||
    ts.isArrowFunction(no) ||
    ts.isMethodDeclaration(no) ||
    ts.isConstructorDeclaration(no) ||
    ts.isGetAccessorDeclaration(no) ||
    ts.isSetAccessorDeclaration(no)
  );
}

function nomeDaFuncao(ts, no) {
  if (ts.isConstructorDeclaration(no)) return 'constructor';
  const proprio = nomeDoNo(ts, no.name);
  if (proprio) return proprio;
  const pai = no.parent;
  if (pai && ts.isVariableDeclaration(pai)) return nomeDoNo(ts, pai.name);
  if (pai && ts.isPropertyAssignment(pai)) return nomeDoNo(ts, pai.name);
  if (pai && ts.isPropertyDeclaration(pai)) return nomeDoNo(ts, pai.name);
  return null;
}

function temModificador(ts, no, tipo) {
  const modificadores = ts.canHaveModifiers(no) ? ts.getModifiers(no) : undefined;
  return (modificadores ?? []).some((m) => m.kind === tipo);
}

function funcaoExportada(ts, no) {
  if (temModificador(ts, no, ts.SyntaxKind.ExportKeyword)) return true;
  const declaracao = no.parent;
  if (!declaracao || !ts.isVariableDeclaration(declaracao)) return false;
  const statement = declaracao.parent?.parent;
  return Boolean(statement && temModificador(ts, statement, ts.SyntaxKind.ExportKeyword));
}

export function contemJsx(ts, no) {
  let achou = false;
  const visita = (filho) => {
    if (achou) return;
    if (ts.isJsxElement(filho) || ts.isJsxSelfClosingElement(filho) || ts.isJsxFragment(filho)) {
      achou = true;
      return;
    }
    ts.forEachChild(filho, visita);
  };
  ts.forEachChild(no, visita);
  return achou;
}

function ehRamificacao(ts, no) {
  if (
    ts.isIfStatement(no) ||
    ts.isConditionalExpression(no) ||
    ts.isForStatement(no) ||
    ts.isForInStatement(no) ||
    ts.isForOfStatement(no) ||
    ts.isWhileStatement(no) ||
    ts.isDoStatement(no) ||
    ts.isCaseClause(no) ||
    ts.isCatchClause(no)
  ) {
    return true;
  }
  return ts.isBinaryExpression(no) && CONECTIVOS_LOGICOS.has(no.operatorToken.getText());
}

function abreNivel(ts, no) {
  return (
    ts.isIfStatement(no) ||
    ts.isForStatement(no) ||
    ts.isForInStatement(no) ||
    ts.isForOfStatement(no) ||
    ts.isWhileStatement(no) ||
    ts.isDoStatement(no) ||
    ts.isSwitchStatement(no) ||
    ts.isTryStatement(no) ||
    ((ts.isArrowFunction(no) || ts.isFunctionExpression(no)) && no.body && ts.isBlock(no.body))
  );
}

// Complexidade ciclomática e profundidade máxima do corpo, sem entrar em
// funções nomeadas aninhadas (elas ganham ficha própria); callbacks anônimos
// contam para a função que os contém, porque são lógica dela.
export function medirCorpo(ts, funcao) {
  let complexidade = 1;
  let profundidadeMaxima = 0;
  const visita = (no, profundidade) => {
    if (no !== funcao && ehFuncao(ts, no) && nomeDaFuncao(ts, no) && !ts.isArrowFunction(no))
      return;
    if (ehRamificacao(ts, no)) complexidade += 1;
    const proxima = abreNivel(ts, no) && no !== funcao ? profundidade + 1 : profundidade;
    if (proxima > profundidadeMaxima) profundidadeMaxima = proxima;
    ts.forEachChild(no, (filho) => visita(filho, proxima));
  };
  visita(funcao, 0);
  return { complexidade, profundidade: profundidadeMaxima };
}

function ehCallbackAnonimo(ts, no) {
  if (!ts.isArrowFunction(no) && !ts.isFunctionExpression(no)) return false;
  return nomeDaFuncao(ts, no) === null;
}

// Função de módulo: declarada no topo do arquivo, e não callback, método ou
// propriedade de objeto — é a única cujo nome repetido em outro arquivo
// sugere cópia.
function ehDeModulo(ts, no) {
  if (ts.isFunctionDeclaration(no)) return Boolean(no.parent && ts.isSourceFile(no.parent));
  const declaracao = no.parent;
  if (!declaracao || !ts.isVariableDeclaration(declaracao)) return false;
  const statement = declaracao.parent?.parent;
  return Boolean(
    statement && ts.isVariableStatement(statement) && ts.isSourceFile(statement.parent),
  );
}

export function descreverFuncao(ts, fonte, no, extensao) {
  const nome = nomeDaFuncao(ts, no);
  const linha = linhaDe(fonte, no.getStart(fonte));
  const linhaFim = linhaDe(fonte, no.end);
  const { complexidade, profundidade } = medirCorpo(ts, no);
  const temJsx = contemJsx(ts, no);
  const ehComponente = Boolean(nome && /^[A-Z]/.test(nome) && temJsx);
  return {
    nome,
    linha,
    linhaFim,
    comprimento: linhaFim - linha + 1,
    parametros: no.parameters.length,
    complexidade,
    profundidade,
    exportada: funcaoExportada(ts, no),
    deModulo: ehDeModulo(ts, no),
    ehMetodo: ts.isMethodDeclaration(no) || ts.isConstructorDeclaration(no),
    ehComponente,
    ehHook: Boolean(nome && /^use[A-Z]/.test(nome)),
    contemJsx: temJsx,
    temTipoDeRetorno:
      Boolean(no.type) || ts.isConstructorDeclaration(no) || ts.isSetAccessorDeclaration(no),
    extensao,
    no,
  };
}

export function coletarFuncoes(ts, fonte, extensao) {
  const funcoes = [];
  const visita = (no) => {
    if (ehFuncao(ts, no) && !ehCallbackAnonimo(ts, no)) {
      funcoes.push(descreverFuncao(ts, fonte, no, extensao));
    }
    ts.forEachChild(no, visita);
  };
  visita(fonte);
  return funcoes;
}

export function decoradoresDe(ts, no) {
  if (!ts.canHaveDecorators(no)) return [];
  return (ts.getDecorators(no) ?? []).map((decorador) => {
    const expressao = decorador.expression;
    const alvo = ts.isCallExpression(expressao) ? expressao.expression : expressao;
    return nomeDoNo(ts, alvo) ?? alvo.getText();
  });
}

export function textoDoJsdoc(ts, no) {
  const blocos = ts.getJSDocCommentsAndTags(no).filter((item) => ts.isJSDoc(item));
  if (blocos.length === 0) return null;
  return blocos.map((bloco) => bloco.getFullText()).join('\n');
}

// Todo comentário é trívia à esquerda de algum nó ou à direita do fim de um nó
// na mesma linha; percorrer os dois lados de todos os nós cobre o arquivo.
export function coletarComentarios(ts, fonte) {
  const texto = fonte.getFullText();
  const vistos = new Set();
  const comentarios = [];
  const registra = (faixa) => {
    if (vistos.has(faixa.pos)) return;
    vistos.add(faixa.pos);
    const bruto = texto.slice(faixa.pos, faixa.end);
    const ehBloco = faixa.kind === ts.SyntaxKind.MultiLineCommentTrivia;
    comentarios.push({
      pos: faixa.pos,
      fim: faixa.end,
      linha: linhaDe(fonte, faixa.pos),
      tipo: !ehBloco ? 'linha' : bruto.startsWith('/**') ? 'jsdoc' : 'bloco',
      texto: limparComentario(bruto),
    });
  };
  const visita = (no) => {
    (ts.getLeadingCommentRanges(texto, no.getFullStart()) ?? []).forEach(registra);
    (ts.getTrailingCommentRanges(texto, no.end) ?? []).forEach(registra);
    ts.forEachChild(no, visita);
  };
  visita(fonte);
  (ts.getLeadingCommentRanges(texto, fonte.endOfFileToken.getFullStart()) ?? []).forEach(registra);
  return comentarios.sort((a, b) => a.pos - b.pos);
}

function limparComentario(bruto) {
  return bruto
    .replace(/^\/\*+|\*+\/$/g, '')
    .replace(/^\/\/\s?/, '')
    .split('\n')
    .map((linha) => linha.replace(/^\s*\*\s?/, '').trim())
    .join('\n')
    .trim();
}

function apagarFaixas(texto, faixas) {
  let resultado = texto;
  for (const faixa of faixas) {
    const trecho = texto.slice(faixa.pos, faixa.fim).replace(/[^\n]/g, ' ');
    resultado = resultado.slice(0, faixa.pos) + trecho + resultado.slice(faixa.fim);
  }
  return resultado;
}

export function apagarComentarios(texto, comentarios) {
  return apagarFaixas(texto, comentarios);
}

// Import multilinha (um símbolo por linha) é igual em dezenas de arquivos e
// não é duplicação de lógica: sai do texto que o detector de clones lê.
export function apagarImports(ts, fonte, texto) {
  const faixas = fonte.statements
    .filter((s) => ts.isImportDeclaration(s) || (ts.isExportDeclaration(s) && s.moduleSpecifier))
    .map((s) => ({ pos: s.getStart(fonte), fim: s.end }));
  return apagarFaixas(texto, faixas);
}

export function contarIdentificadores(ts, fonte) {
  const contagem = new Map();
  const visita = (no) => {
    if (ts.isIdentifier(no) || ts.isPrivateIdentifier(no)) {
      contagem.set(no.text, (contagem.get(no.text) ?? 0) + 1);
    }
    ts.forEachChild(no, visita);
  };
  visita(fonte);
  return contagem;
}
