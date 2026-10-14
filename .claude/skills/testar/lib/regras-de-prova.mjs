// O teste prova alguma coisa? Sem asserção, tautologia, eco do mock, só
// "foi chamado", só snapshot, asserção fraca, pulado, exclusivo, fake inline.
import { achado } from '../../refatorar/lib/achados.mjs';

const CATEGORIA = 'prova';
const IGUALDADE = new Set(['toBe', 'toEqual', 'toStrictEqual', 'toMatchObject']);
const SO_CHAMADA = /^(toHaveBeenCalled|toBeCalled|toHaveBeenCalledTimes|toBeCalledTimes)$/;
const SNAPSHOT = /Snapshot$/;
const FRACAS = new Set(['toBeDefined', 'toBeTruthy', 'toBeFalsy']);
const FRACAS_NEGADAS = new Set(['toBeNull', 'toBeUndefined', 'toThrow', 'toThrowError']);
const PRIMITIVO = /^(null|undefined|true|false|-?\d+(\.\d+)?|'[^']*'|"[^"]*"|`[^`]*`|\[\]|\{\})$/;
// screen.getByText('x') já carrega o valor esperado: not.toBeNull() em cima dela não é fraco.
const QUERY_DA_TESTING_LIBRARY = /\b(get|query|find)(All)?By[A-Z]\w*\(/;

export function analisarProva(contexto) {
  return contexto.specs.flatMap((ficha) => [
    ...ficha.testes.flatMap((teste) => regrasDoTeste(ficha, teste)),
    ...ficha.describes.flatMap((describe) => blocoExclusivoOuPulado(ficha, describe, 'describe')),
    ...ficha.fakesInline.map((item) =>
      achado(
        CATEGORIA,
        'dependencia-fake-inline',
        'info',
        ficha,
        item.linha,
        'dependência falsa montada inline com jest.fn()/vi.fn() dentro do new',
        'fake nomeada: class XFake implements XPort (CLAUDE.md)',
      ),
    ),
  ]);
}

function regrasDoTeste(ficha, teste) {
  const dosModificadores = blocoExclusivoOuPulado(ficha, teste, 'it');
  if (teste.modificadores.includes('todo')) return dosModificadores;
  const reais = teste.expects.filter((item) => !item.estatico);
  return [
    ...dosModificadores,
    ...semAssercao(ficha, teste, reais),
    ...tautologias(ficha, teste, reais),
    ...ecoDoMock(ficha, teste, reais),
    ...soVerificaChamada(ficha, teste, reais),
    ...soSnapshot(ficha, teste, reais),
    ...assercaoFraca(ficha, teste, reais),
  ];
}

function blocoExclusivoOuPulado(ficha, bloco, tipo) {
  if (bloco.modificadores.includes('only')) {
    return [
      achado(
        CATEGORIA,
        'teste-exclusivo',
        'erro',
        ficha,
        bloco.linha,
        `${tipo}.only deixa o resto do arquivo sem rodar`,
        'remover o .only antes de fechar',
      ),
    ];
  }
  if (bloco.modificadores.includes('skip') || bloco.modificadores.includes('todo')) {
    return [
      achado(
        CATEGORIA,
        'teste-pulado',
        'aviso',
        ficha,
        bloco.linha,
        `${tipo} pulado: "${bloco.nome}"`,
        'ou o cenário volta a rodar, ou sai com o porquê na mensagem do commit',
      ),
    ];
  }
  return [];
}

function semAssercao(ficha, teste, reais) {
  const declaraContagem = teste.expects.some(
    (item) => item.estatico && /^(assertions|hasAssertions)$/.test(item.matcher),
  );
  if (reais.length > 0 || teste.chamaAsseguradora || declaraContagem) return [];
  return [
    achado(
      CATEGORIA,
      'teste-sem-assercao',
      'erro',
      ficha,
      teste.linha,
      `"${teste.nome}" não tem expect: passa sempre`,
      'asserir o resultado observável (retorno, DOM, chamada com argumentos)',
    ),
  ];
}

// expect(x).toBe(x) não prova nada; expect(f()).toBe(f()) prova só que f é
// determinística ou singleton, o que pode ser o cenário, mas o nome tem que dizer.
function tautologias(ficha, teste, reais) {
  return reais
    .filter(
      (item) =>
        IGUALDADE.has(item.matcher) &&
        !item.negado &&
        item.alvo !== '' &&
        item.alvo === item.argumento,
    )
    .map((item) => {
      const ehChamada = item.alvo.includes('(');
      const severidade = ehChamada ? 'aviso' : 'erro';
      const mensagem = ehChamada
        ? `expect(${item.alvo}).${item.matcher}(${item.argumento}) chama a mesma expressão dos dois lados`
        : `expect(${item.alvo}).${item.matcher}(${item.argumento}) compara a coisa com ela mesma`;
      const sugestao = ehChamada
        ? 'só prova determinismo/identidade; se é esse o cenário, o nome do it diz isso'
        : 'comparar com o valor esperado escrito à mão';
      return achado(
        CATEGORIA,
        'assercao-tautologica',
        severidade,
        ficha,
        item.linha,
        mensagem,
        sugestao,
      );
    });
}

// O mock devolve X e o teste confere X: só prova que a chamada passou adiante.
function ecoDoMock(ficha, teste, reais) {
  const valoresDoArquivo = ficha.ganchos.flatMap((gancho) => gancho.valoresDeMock);
  const valores = new Set(
    [...teste.valoresDeMock, ...valoresDoArquivo].filter((texto) => !PRIMITIVO.test(texto)),
  );
  if (valores.size === 0) return [];
  return reais
    .filter((item) => IGUALDADE.has(item.matcher) && !item.negado && valores.has(item.argumento))
    .map((item) =>
      achado(
        CATEGORIA,
        'eco-do-mock',
        'aviso',
        ficha,
        item.linha,
        `confere ${item.argumento}, que é exatamente o que um mock devolveu`,
        'asserir a transformação que a unidade faz; se ela só repassa, diga isso no nome do it',
      ),
    );
}

function soVerificaChamada(ficha, teste, reais) {
  if (reais.length === 0 || !reais.every((item) => SO_CHAMADA.test(item.matcher) && !item.negado))
    return [];
  return [
    achado(
      CATEGORIA,
      'so-verifica-chamada',
      'aviso',
      ficha,
      teste.linha,
      `"${teste.nome}" só confere que algo foi chamado`,
      'toHaveBeenCalledWith(argumentos) ou o efeito observável da chamada',
    ),
  ];
}

function soSnapshot(ficha, teste, reais) {
  if (reais.length === 0 || !reais.every((item) => SNAPSHOT.test(item.matcher))) return [];
  return [
    achado(
      CATEGORIA,
      'so-snapshot',
      'aviso',
      ficha,
      teste.linha,
      `"${teste.nome}" só compara snapshot`,
      'snapshot não diz qual comportamento importa; asserir o texto ou o estado que o cenário promete',
    ),
  ];
}

function assercaoFraca(ficha, teste, reais) {
  const ehFraca = (item) =>
    !QUERY_DA_TESTING_LIBRARY.test(item.alvo) &&
    ((FRACAS.has(item.matcher) && !item.negado) ||
      (FRACAS_NEGADAS.has(item.matcher) && item.negado));
  if (reais.length === 0 || !reais.every(ehFraca)) return [];
  return [
    achado(
      CATEGORIA,
      'assercao-fraca',
      'aviso',
      ficha,
      teste.linha,
      `"${teste.nome}" só afirma que existe/não estoura (${reais.map((i) => i.matcher).join(', ')})`,
      'asserir o valor: toBe, toEqual, toHaveTextContent…',
    ),
  ];
}
