---
description: Refatora um alvo do client (React + Vite + PixiJS + Zustand) pela skill refatorar, somando a lente da stack do client — o client pede e desenha o estado confirmado pelo server; regra de jogo no game-core, nunca reescrita; React só para painéis e o tabuleiro no renderer PixiJS; rede só por src/services/ validando o DTO; lib de terceiro no seu lugar. Diagnóstico → plano em fases de 5 arquivos → aprovação → execução.
argument-hint: [pasta ou arquivo dentro de client/ — ex.: client/src/features/board]
allowed-tools: Skill, Read, Grep, Glob, Edit, Write, AskUserQuestion, Bash(node:*), Bash(pnpm:*), Bash(cp:*), Bash(git status:*), Bash(git diff:*), Bash(git log:*), Bash(ls:*), Bash(find:*)
---

# /refatorar-client — Refatoração de um alvo do client

O fluxo é o da skill `refatorar`: driver → triagem no código → diagnóstico → plano em fases de até 5 arquivos → aprovação → execução fase a fase → docs. Este comando acrescenta o que o driver não enxerga: **as regras da stack do client**. Elas entram na triagem (passo 3 da skill) como achados próprios e no plano (passo 5) como critério de em qual pasta (e em qual camada: tela, store, serviço, renderer, game-core) cada trecho vai parar.

## Regras invioláveis

1. **O alvo precisa estar dentro de `client/`.** Alvo em `server/` → `/refatorar-server`. Alvo vazio → pergunte antes de qualquer coisa.
2. **Tudo que a skill proíbe continua proibido**: nada muda antes do plano aprovado; achado do driver é hipótese; fases de 5 arquivos; comportamento não muda; bug vira teste de regressão e item separado.
3. **Mudança de contrato não é refatoração.** DTO do contracts, nome ou payload de evento, rota da API: qualquer um que "precisaria" mudar vira item separado do plano, marcado **mudança de contrato**, com as duas pontas descritas, e fica para decisão do usuário.
4. **Estas libs não são as que você conhece.** React 19, React Router 8, Vite 8, PixiJS 8, Zustand 5 e Tailwind 4 são mais novos que o conhecimento de treinamento. Antes de mexer em rota, leia o guia em `client/node_modules/react-router/docs/`; para PixiJS e Zustand, consulte o context7.
5. **`src/components/ui/` (shadcn) e o `src/lib/utils.ts` do shadcn são gerados.** Não se refatoram; regeneram-se (`pnpm --filter @lorkarium/client exec shadcn add <componente>`, com o `shadcn` já instalado no client).

## Passo a passo

1. Invoque a skill com o alvo: `Skill(refatorar, args: "<alvo>")` e siga os sete passos dela.
2. Antes de abrir fonte, leia `docs/context/client.md` e o doc da área que o cabeçalho do driver apontar (`leia antes:`). Sem doc da área, `docs/spec.md` §3.3–§3.9 e §5.
3. Na triagem, passe cada arquivo do alvo pela **Lente do client** abaixo. Achado da lente entra no diagnóstico na mesma forma dos do driver: `arquivo:linha`, o que está errado, a proposta concreta (para onde vai, com que nome, com qual teste).
4. No plano, cada fase diz em **qual pasta** cada trecho vai parar (tabela "Onde cada coisa mora").
5. A seção "Verificação" abaixo substitui a da skill para o client.

## Lente do client

### Onde cada coisa mora

| O que                                                                              | Onde                                                     | Molde (spec §10)                                                             |
| ---------------------------------------------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Casca da aplicação, rotas, layout raiz                                             | `src/app/`                                               | a rota monta a tela; lógica vai para `features/`                             |
| Tela de uma área (campanhas, cenas, tabuleiro, tokens, combate, sessões)           | `src/features/<área>/`                                   | componente folha com estado e evento                                         |
| Componente compartilhado por 2+ áreas                                              | `src/components/`                                        | primitivas de layout e de painel                                             |
| Componente shadcn gerado                                                           | `src/components/ui/`                                     | não se edita à mão                                                           |
| Tabuleiro: mapa, grid, tokens, câmera, zoom, seleção, arraste, barras sobre o mapa | `src/renderer/` (TypeScript sobre PixiJS, **sem React**) | API de montar/atualizar/destruir que o componente de `features/board/` chama |
| Rede: HTTP e Socket.IO, validação da resposta e do evento pelo DTO                 | `src/services/`                                          | a tela nunca chama `fetch` nem `socket.emit`                                 |
| Estado: o confirmado pelo server (snapshot + versão) e o local de interação        | `src/stores/` (Zustand)                                  | os dois separados: o local nunca sobrescreve o confirmado                    |
| Regra de jogo (célula, distância, turno, condição)                                 | `packages/game-core`                                     | nunca reescrita no client                                                    |
| Forma de dado que vem do server                                                    | `packages/contracts` (DTO)                               | tipo local com os mesmos campos é duplicação                                 |
| Genérico sem domínio (formatação, browser, URL)                                    | `src/lib/`                                               | teste sem DOM                                                                |

### O client pede; o server decide; o client desenha o confirmado

- **O client envia comando e exibe o estado confirmado** (spec §2.2, §5.3). Mudança de HP, turno ou posição aplicada direto na store "porque o server vai aceitar" é achado. A exceção documentada é o **estado temporário de interação** (a prévia do token sendo arrastado), que vive separado e é descartado ou reconciliado quando o evento confirmado chega.
- **A posição visual deriva de coordenadas de mundo** (spec §3.4). Coordenada de tela guardada em store, ou conta mundo ↔ tela fora da câmera do renderer, é achado.
- **Regra de jogo no client é cópia do game-core** (`utilitario-existente-ignorado` com sugestão em `packages/game-core/…`): o caminho é importar de `@lorkarium/game-core`, nunca reescrever — senão client e server divergem na primeira mudança.
- **Reconexão e versão** (spec §5.6): evento com versão menor que a do snapshot é descartado; store que aplica evento sem olhar a versão é bug (teste de regressão + item separado).
- **Identidade nunca vai no payload** (spec §7.3): o client não manda `userId`/`role`; o server tira da conexão. Comando montado com identidade é achado (e mudança de contrato se o DTO aceita o campo).

### React e PixiJS separados

- `src/renderer/` não importa React (`react-no-renderer`, erro) e o resto do client não importa `pixi.js` (`lib-de-terceiro-fora-do-adaptador`). O componente que monta o canvas chama a API do renderer num efeito e a destrói no cleanup.
- **Não recriar objetos PixiJS a cada mudança de estado** (spec §9.1): renderer que destrói e recria a cena inteira quando um token se move é achado de desempenho; o caminho é o diff (o que entrou, o que saiu, o que mudou) — e o diff é função pura, testável sem WebGL.
- Assinatura de store dentro do renderer deve ser seletiva (só a fatia que ele desenha); re-render de React disparado por cada frame do arraste é achado.

### Rede, store e tela

- `fetch(` e Socket.IO direto em componente (`fetch-cru-em-componente`, `socket-cru-em-componente`): o trecho vai para `src/services/`, que valida a resposta/evento com o DTO de `@lorkarium/contracts` antes de entregar à store.
- `create` do Zustand fora de `src/stores/` é lib fora do lugar; a tela consome pelos hooks/seletores que a store exporta.
- Componente acima de 60 linhas úteis: procurar responsabilidades (estado, layout, ação, desenho), não picar por tamanho. Hook acima de 30, o mesmo teste.
- Estado vazio de **uma coleção** troca só o bloco dela; early return que descarta a coleção irmã é bug.
- Componente que só uma outra área importa mora na área que o usa (`componente-na-area-errada`). Compartilhado de verdade vai para `src/components/`.
- Função pura exportada de um `.tsx` (`logica-exportada-de-componente`) vai para `src/lib/`, para o game-core ou para um `.ts` irmão, com spec sem DOM.
- `process.env` não existe no browser (`process-env-no-client`): config pública é `import.meta.env.VITE_*`, lida num módulo só; segredo nunca vai para o client.

### Testes

- Vitest em `client/test/` espelhando `src/`, import via `@/`. Lógica sem DOM (`src/lib/`, stores, a conta do renderer) roda hoje.
- Spec de componente exige `@testing-library/react` e `jsdom` (ainda não instalados) e o `environment` do projeto `client` no Vitest — dependência nova é pergunta para o usuário.
- I/O por fake nomeado (cliente HTTP falso, socket falso que guarda o que recebeu), nunca `vi.fn()` solto em `globalThis.fetch`.
- `pnpm typecheck` é obrigatório em toda fase: o transpile do Vitest não checa tipo.

## Verificação (da raiz)

```bash
pnpm exec vitest run <specs tocados>
pnpm test && pnpm lint && pnpm typecheck
```

Ao fim de cada fase, re-rode o driver no alvo com `--min aviso`: os achados tratados sumiram e nenhum novo apareceu.

## Docs

- Tela, store, serviço ou renderer mudou → `docs/context/client.md` e o doc da área (`board.md`, `combat.md`…), com a linha no índice do hub.
- Padrão errado corrigido → a seção "Armadilhas" do doc da área (ou `docs/context/client/armadilhas*.md`, quando o hub tiver subpasta).

## Alvo

$ARGUMENTS
