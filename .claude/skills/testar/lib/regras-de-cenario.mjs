// O it descreve um cenário? Nome genérico ou curto, nome repetido, describe
// sem teste, cenário longo demais e regressão sem dizer de onde veio.
import { achado, linhasUteis } from '../../refatorar/lib/achados.mjs';

const CATEGORIA = 'cenarios';
const NOMES_GENERICOS =
  /^(funciona|works?|it works|deve funcionar|should work|test|teste|ok|renderiza|renders?|smoke|b[aá]sico|basic|happy path|sucesso|success|erro|error)$/i;
const MINIMO_DE_PALAVRAS = 3;
const TETO_DE_LINHAS_DO_CENARIO = 40;
const REFERENCIA_DE_REGRESSAO =
  /#\d+|\b[0-9a-f]{7,40}\b|armadilha|\d{2}\/\d{2}\/\d{4}|\d{4}-\d{2}-\d{2}|§\s?\d|issue|\bPR\b/i;

export function analisarCenarios(contexto) {
  return contexto.specs.flatMap((ficha) => [
    ...ficha.testes.flatMap((teste) => regrasDoTeste(ficha, teste)),
    ...nomesRepetidos(ficha),
    ...describesSemTeste(ficha),
  ]);
}

function regrasDoTeste(ficha, teste) {
  return [
    ...nomeSemCenario(ficha, teste),
    ...cenarioLongo(ficha, teste),
    ...regressaoSemReferencia(ficha, teste),
  ];
}

function nomeSemCenario(ficha, teste) {
  // No it.each o placeholder (%s, $campo) carrega o cenário; o nome curto é da tabela.
  if (teste.modificadores.includes('each') && /[%$]/.test(teste.nome)) return [];
  const palavras = teste.nome.split(/\s+/).filter(Boolean);
  const generico = NOMES_GENERICOS.test(teste.nome.trim()) || palavras.length < MINIMO_DE_PALAVRAS;
  if (!generico) return [];
  return [
    achado(
      CATEGORIA,
      'nome-sem-cenario',
      'aviso',
      ficha,
      teste.linha,
      `"${teste.nome}" não diz o cenário`,
      'nome = situação + resultado: "id fora da conta devolve NAO_ENCONTRADO"',
    ),
  ];
}

function cenarioLongo(ficha, teste) {
  const uteis = linhasUteis(ficha, teste.linha, teste.linhaFinal);
  if (uteis <= TETO_DE_LINHAS_DO_CENARIO) return [];
  return [
    achado(
      CATEGORIA,
      'cenario-longo',
      'info',
      ficha,
      teste.linha,
      `"${teste.nome}" tem ${uteis} linhas úteis (teto ${TETO_DE_LINHAS_DO_CENARIO})`,
      'um cenário por it; preparação repetida vai para fábrica ou beforeEach',
    ),
  ];
}

function regressaoSemReferencia(ficha, teste) {
  const texto = `${teste.nome}\n${teste.comentarios}`;
  if (!/regress/i.test(texto) || REFERENCIA_DE_REGRESSAO.test(texto)) return [];
  return [
    achado(
      CATEGORIA,
      'regressao-sem-referencia',
      'info',
      ficha,
      teste.linha,
      `"${teste.nome}" é regressão sem dizer de onde veio`,
      'comentário // Regressão: <o que quebrava> (#issue, SHA, data ou armadilha)',
    ),
  ];
}

function nomesRepetidos(ficha) {
  const vistos = new Map();
  const achados = [];
  for (const teste of ficha.testes) {
    const chave = `${teste.describe?.linha ?? 0}|${teste.nome}`;
    if (vistos.has(chave)) {
      achados.push(
        achado(
          CATEGORIA,
          'nome-repetido',
          'aviso',
          ficha,
          teste.linha,
          `"${teste.nome}" repete o nome do it da linha ${vistos.get(chave)}`,
          'dois cenários, dois nomes; ou é o mesmo cenário duas vezes',
        ),
      );
      continue;
    }
    vistos.set(chave, teste.linha);
  }
  return achados;
}

function describesSemTeste(ficha) {
  return ficha.describes
    .filter((describe) => describe.testes === 0)
    .map((describe) =>
      achado(
        CATEGORIA,
        'describe-sem-teste',
        'aviso',
        ficha,
        describe.linha,
        `describe "${describe.nome}" não tem nenhum it`,
        'apagar o bloco ou escrever o cenário',
      ),
    );
}
