export const SEVERIDADES = ['erro', 'aviso', 'info'];

export function achado(categoria, regra, severidade, ficha, linha, mensagem, sugestao = null) {
  if (!SEVERIDADES.includes(severidade)) {
    throw new Error(`Severidade ${severidade} inválida; esperado uma de ${SEVERIDADES.join(', ')}`);
  }
  return {
    categoria,
    regra,
    severidade,
    arquivo: ficha.relativoAoRepo,
    linha,
    mensagem,
    sugestao,
  };
}

// Linhas de código de verdade dentro de uma faixa: sem vazias e sem as que
// são só comentário, para o teto de linhas de função não punir docstring.
export function linhasUteis(ficha, linhaInicial, linhaFinal) {
  return ficha.linhas
    .slice(linhaInicial - 1, linhaFinal)
    .map((linha) => linha.trim())
    .filter((linha) => linha !== '' && !/^(\/\/|\/\*|\*)/.test(linha)).length;
}

export function ordenarAchados(achados) {
  const peso = (achadoAtual) => SEVERIDADES.indexOf(achadoAtual.severidade);
  return [...achados].sort(
    (a, b) => peso(a) - peso(b) || a.arquivo.localeCompare(b.arquivo) || a.linha - b.linha,
  );
}
