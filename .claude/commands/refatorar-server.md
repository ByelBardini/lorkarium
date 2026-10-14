---
description: Refatora um alvo do server (Fastify + Drizzle + Socket.IO) pela skill refatorar, somando a lente da stack do server — a borda só valida o DTO e delega, regra no BO (sem I/O) ou no game-core, PO só como tabela, DAO só consulta, lib de terceiro atrás de porta, o server como autoridade de todo estado. Diagnóstico → plano em fases de 5 arquivos → aprovação → execução.
argument-hint: [pasta ou arquivo dentro de server/ — ex.: server/src/modules/combat]
allowed-tools: Skill, Read, Grep, Glob, Edit, Write, AskUserQuestion, Bash(node:*), Bash(pnpm:*), Bash(cp:*), Bash(git status:*), Bash(git diff:*), Bash(git log:*), Bash(ls:*), Bash(find:*)
---

# /refatorar-server — Refatoração de um alvo do server

O fluxo é o da skill `refatorar`: driver → triagem no código → diagnóstico → plano em fases de até 5 arquivos → aprovação → execução fase a fase → docs. Este comando acrescenta o que aquele driver não enxerga: **as camadas do server e as regras do servidor autoritativo**. Elas entram na triagem (passo 3 da skill) como achados próprios — com a ajuda do driver de camadas do `/desenvolver-server` — e no plano (passo 5) como critério de onde cada trecho vai parar.

## Regras invioláveis

1. **O alvo precisa estar dentro de `server/`.** Alvo em `client/` → `/refatorar-client`. Alvo em `packages/game-core` ou `packages/contracts` → a skill direto (`/refatorar <alvo>`): o driver já traz as regras dos pacotes. Alvo vazio → pergunte antes de qualquer coisa.
2. **Tudo que a skill proíbe continua proibido**: nada muda antes do plano aprovado; achado do driver é hipótese; fases de 5 arquivos; comportamento não muda; bug vira teste de regressão e item separado.
3. **Mudança de contrato não é refatoração.** DTO, endpoint, nome ou payload de evento, tabela ou env var que "precisaria" mudar vira item separado do plano, marcado **mudança de contrato**, com as duas pontas (server e client) descritas, e fica para decisão do usuário. Refatorar o server nunca deixa o client quebrado — os dois consomem o mesmo `@lorkarium/contracts`.
4. **Migração não nasce de refatoração.** Coluna, índice ou tabela que "ajudaria" é entrega própria (`/desenvolver-server`).

## Passo a passo

1. Invoque a skill com o alvo: `Skill(refatorar, args: "<alvo>")` e siga os sete passos dela.
2. Antes de abrir fonte, leia `docs/context/server.md` **e** o doc da área que o cabeçalho do driver apontar (`leia antes:`). Sem doc da área, a seção correspondente de `docs/spec.md`.
3. Rode também o driver de camadas no mesmo alvo — ele cobra o que a lente abaixo descreve (camada pelo sufixo, setas, fiação):

   ```bash
   node .claude/skills/desenvolver-server/driver.mjs <alvo> --min aviso
   ```

4. Na triagem, passe cada arquivo do alvo pela **Lente do server** abaixo. Achado da lente (ou do driver de camadas) entra no diagnóstico na mesma forma dos do driver: `arquivo:linha`, o que está errado, a proposta concreta (para qual camada vai, com que nome, com qual teste).
5. No plano, cada fase diz em **qual camada** cada trecho vai parar (tabela "Onde cada coisa mora").
6. A seção "Verificação" abaixo substitui a da skill para o server.

## Lente do server

### Onde cada coisa mora

O vocabulário (PO, DAO, BO, DTO, VO) é o do artigo da DevMedia, detalhado na skill `desenvolver-server`.

| O que                                                                     | Onde                                                                   | Regra                                                                     |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Forma do que atravessa a rede (body, resposta, comando, evento) — **DTO** | `packages/contracts/src/<área>/<x>.dto.ts`                             | schema Zod estrito + tipo inferido; sem regra                             |
| Valor do domínio (posição, célula, HP, iniciativa) — **VO**               | `packages/game-core/src/<x>.vo.ts`                                     | imutável, sem `id`, construtor que recusa citando o valor                 |
| Mecânica genérica (turno, rodada, duração de condição, distância)         | `packages/game-core/src/`                                              | pura, determinística; o client usa a mesma                                |
| A linha persistida — **PO**                                               | `<m>.po.ts`                                                            | tabela Drizzle + `$inferSelect`/`$inferInsert`; nada mais                 |
| Consulta — **DAO**                                                        | `<m>.dao.ts`                                                           | recebe `db`/`tx` pelo construtor; devolve PO; filtra pela campanha        |
| Regra do caso de uso — **BO**                                             | `<m>.bo.ts`                                                            | construído a partir de PO convertido; sem `async`, sem relógio, sem banco |
| Conversão PO → BO → DTO                                                   | `<m>.mapper.ts`                                                        | funções puras                                                             |
| Orquestração (DAO + mapper + BO + porta + publicação)                     | `<m>.service.ts`                                                       | persiste antes de confirmar                                               |
| Borda HTTP                                                                | `<m>.routes.ts`                                                        | DTO na entrada, autor da sessão, uma chamada, erro → status               |
| Borda Socket.IO                                                           | `<m>.gateway.ts`                                                       | DTO no payload, autor de `socket.data`, `ack`, evento com versão          |
| I/O que não é banco (storage, relógio, id, hash)                          | `<m>.port.ts` (interface) + adaptador em `src/infrastructure/<porta>/` | a lib só no adaptador                                                     |
| Fiação do módulo                                                          | `<m>.plugin.ts`, registrado em `src/app/`                              | monta DAO/service com o que o app entrega                                 |
| Genérico sem domínio                                                      | `src/lib/`                                                             | não conhece módulo nenhum                                                 |
| Env                                                                       | `src/config/env.ts` (schema Zod)                                       | `process.env` só lá e em `src/index.ts`                                   |

### O servidor é a autoridade; a borda só valida e delega

- **Handler com `if` de negócio, cálculo ou mais de ~20 linhas** (`handler-com-logica` é `info` no driver): **aqui é item de plano**. A decisão vai para o BO (ou para o game-core, se é mecânica que o client também calcula); a orquestração, para o service. A borda fica com DTO, autor, uma chamada e a tradução do erro.
- **Identidade nunca vem do payload** (spec §7.3, `identidade-do-payload`): quem pede é `request.user` / `socket.data`; o payload só diz o que se pede. Achado aqui é `erro` de segurança, mesmo que o driver marque aviso.
- **O server é a fonte da verdade** de posição, HP, turno, rodada, versão do estado. Endpoint ou evento que aceita do client algo que o server sabe derivar (a posição final já "encaixada" no grid, o próximo combatente, a versão) é achado; a correção é mudança de contrato (regra 3), mas o diagnóstico registra.
- **Persistir antes de confirmar** (spec §5.5): evento publicado antes do `await` do DAO, ou `ack` de sucesso antes de gravar, é bug — teste de regressão e item separado.
- **Evento com identificador e versão** (spec §5.5, §5.6): publicação sem versão impede o client de descartar evento velho na reconexão.
- **Comando crítico deduplicado por `actionId`** (spec §6, `ProcessedCommand`): aplicação dupla na retransmissão é bug.

### Dado, transação e campanha

- **Toda consulta de dado de campanha filtra pela campanha da sessão** (spec §2.6, §13.14). DAO que busca token, cena ou combate só pelo id é achado de isolamento — a correção pode ser mudança de contrato do DAO, e o cenário "campanha B não vê a linha da campanha A" entra na integração.
- **Consulta fora do DAO** (`consulta-fora-do-dao`): o trecho vai para o DAO do módulo e o chamador recebe o PO.
- **DAO de outro módulo importado direto** (`repositorio-de-outro-modulo`): vira item de plano quando o módulo dono tem service — passa a expor por ele.
- **Transação**: quem abre é o encanamento de `src/database/`; `db.transaction` espalhado por service é pergunta, não refatoração.
- **Estado em memória × banco** (spec §5.5, §14): mover a escrita de lugar não pode criar janela em que os dois divergem.

### Entrada, saída e erro

- Body, params e payload só por DTO do contracts (`borda-sem-dto`, `schema-fora-do-contracts`). Schema Zod declarado no módulo vai para o contracts — é mudança de contrato se o client ainda não o tem.
- Erro de domínio (`*.error.ts`) cita **o valor recebido e a forma esperada**; "Not found" seco é `mensagem-de-erro-sem-valor`.
- Log só pelo logger do Fastify (`request.log`, `app.log`); `console.*` sai.
- VO nasce pelo construtor do game-core; `as GridPosition` é `vo-por-assercao`.

### Testes

- Unit em `server/test/` espelhando `src/` (BO, mapper, service com fake nomeado); integração em `server/test/integration/` (borda + DAO + Postgres descartável).
- I/O externo por **fake nomeado** que implementa a porta inteira e guarda o que recebeu; nada de `vi.fn()` solto em objeto inline.
- Spec que muda só por rename é ajuste; spec que muda de **asserção** é sinal de que o comportamento mudou. Pare e reveja a regra 4 da skill.

## Verificação (da raiz)

```bash
pnpm exec vitest run <specs tocados>
pnpm test && pnpm lint && pnpm typecheck
node .claude/skills/desenvolver-server/driver.mjs <alvo> --min aviso
```

Integração só quando a fase tocou borda, DAO, PO ou plugin, e sempre no Postgres descartável da receita da skill `testar` — nunca no banco do `pnpm db:up`. Ao fim de cada fase, re-rode o driver da skill no alvo com `--min aviso`: os achados tratados sumiram e nenhum novo apareceu.

## Docs

- Estrutura ou módulo mudou → `docs/context/server.md` e o doc da área.
- Padrão errado corrigido → a seção "Armadilhas" do doc da área (ou `docs/context/server/armadilhas.md`, quando o hub tiver subpasta).

## Alvo

$ARGUMENTS
