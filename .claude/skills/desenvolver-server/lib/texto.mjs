// Busca de padrão sobre o texto **sem comentários** da ficha. Existe por uma
// armadilha concreta (vista no Trakio): a docstring do projeto traz uma linha
// `Example:` com código de verdade dentro, e procurar no texto cru acusava
// arquivo puro de consultar o banco por causa do exemplo.

/** A primeira linha (1-based) em que o padrão casa no código, ignorando
 *  comentários; `null` quando não casa.
 *
 *  Example: `linhaDoPadrao(ficha, /\bz\.object\(/) // 12` */
export function linhaDoPadrao(ficha, padrao) {
  const linhas = ficha.textoSemComentarios.split('\n');
  const indice = linhas.findIndex((linha) => padrao.test(linha));
  return indice === -1 ? null : indice + 1;
}

/** A linha em que o padrão casa no código **inteiro**, para construções que
 *  quebram linha (`z\n  .object(` no encadeamento formatado pelo prettier).
 *
 *  Example: `linhaDaOcorrencia(ficha, /\bz\s*\.\s*object\(/) // 4` */
export function linhaDaOcorrencia(ficha, padrao) {
  const ocorrencia = padrao.exec(ficha.textoSemComentarios);
  return ocorrencia === null
    ? null
    : ficha.textoSemComentarios.slice(0, ocorrencia.index).split('\n').length;
}

/** Se o padrão aparece no código da ficha, fora de comentário.
 *
 *  Example: `temPadrao(ficha, /\bawait\b/) // true` */
export function temPadrao(ficha, padrao) {
  return padrao.test(ficha.textoSemComentarios);
}
