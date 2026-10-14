// Onde o spec mora e de onde importa: test/ espelhando src/, import pelo alias
// do workspace (quando ele existe), e nunca mockar o próprio arquivo que o
// spec espelha.
import { achado } from '../../refatorar/lib/achados.mjs';
import {
  aliasDeProducao,
  ehApoioDeTeste,
  ehIntegracao,
  fonteDoSpec,
  resolverEspecificador,
} from './espelho.mjs';

const CATEGORIA = 'lugar';

export function analisarLugar(contexto) {
  return contexto.specs.flatMap((ficha) => [
    ...specForaDeTest(ficha),
    ...importsRelativosDeProducao(contexto, ficha),
    ...mockDaUnidadeSobTeste(contexto, ficha),
    ...specSemEspelho(contexto, ficha),
  ]);
}

function specForaDeTest(ficha) {
  if (!ficha.relativo.startsWith('src/')) return [];
  return [
    achado(
      CATEGORIA,
      'teste-fora-de-test',
      'erro',
      ficha,
      1,
      'spec dentro de src/',
      'mover para test/ espelhando src/ (integração do server em test/integration/)',
    ),
  ];
}

// Sem alias no tsconfig do workspace, o relativo é o único caminho; a correção
// seria configurar o alias, e isso é pergunta, não achado de spec.
function importsRelativosDeProducao(contexto, ficha) {
  const alias = aliasDeProducao(contexto.app);
  if (!alias) return [];
  return ficha.imports
    .filter((item) => item.especificador.startsWith('.'))
    .filter((item) =>
      resolverEspecificador(contexto.app, ficha.relativo, item.especificador)?.startsWith('src/'),
    )
    .map((item) =>
      achado(
        CATEGORIA,
        'spec-importa-src-relativo',
        'aviso',
        ficha,
        item.linha,
        `importa produção por caminho relativo (${item.especificador})`,
        `importar via ${alias}...`,
      ),
    );
}

function mockDaUnidadeSobTeste(contexto, ficha) {
  const espelho = fonteDoSpec(contexto.app, ficha.relativo);
  if (!espelho?.fonte) return [];
  const fonteSemExtensao = espelho.fonte.replace(/\.(ts|tsx)$/, '');
  return ficha.mocksDeModulo
    .filter(
      (item) =>
        resolverEspecificador(contexto.app, ficha.relativo, item.especificador) ===
        fonteSemExtensao,
    )
    .map((item) =>
      achado(
        CATEGORIA,
        'mock-da-unidade-sob-teste',
        'erro',
        ficha,
        item.linha,
        `mocka ${item.especificador}, que é o próprio arquivo que este spec espelha`,
        'mockar só as dependências (portas, I/O); a unidade roda de verdade',
      ),
    );
}

function specSemEspelho(contexto, ficha) {
  if (
    ehIntegracao(ficha.relativo) ||
    ehApoioDeTeste(ficha.relativo) ||
    ficha.relativo.startsWith('src/')
  )
    return [];
  const espelho = fonteDoSpec(contexto.app, ficha.relativo, ficha.importsResolvidos);
  if (!espelho || espelho.fonte) return [];
  return [
    achado(
      CATEGORIA,
      'spec-sem-espelho',
      'info',
      ficha,
      1,
      `nenhum arquivo em ${espelho.pastaDaFonte}/ com esse nome`,
      'spec de cenário transversal é válido; se espelha um arquivo, renomeie para o nome dele',
    ),
  ];
}
