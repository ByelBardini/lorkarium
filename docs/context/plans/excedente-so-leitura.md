# Planos: o excedente só leitura

Detalhe da seção "Regra efetiva" de [`../plans.md`](../plans.md). Quando o plano do dono desce, o que passou do teto continua existindo, mas a **configuração** dele fica só leitura; o **jogo** segue livre e apagar sempre passa.

## A regra (`server/src/modules/plans/plan-limits.bo.ts`)

- `PlanLimitsBo.requireEditable(resource, rank, limits)` (estático; `resource` é um `PlanEditableResource`): lança `PlanLimitError` com `reason: 'readOnly'` quando `rank >= limits[PLAN_COUNT_LIMIT_KEY[resource]]`.
- `PlanLimitsBo.isReadOnly(resource, rank, limits)` → `boolean`: a mesma regra sem lançar; é o `planLocked` dos DTOs de lista (os mappers e BOs dos módulos chamam esta, nunca um try/catch em volta do `requireEditable`).
- `rank` = quantos itens do **mesmo grupo** nasceram antes deste, contados a partir de 0, pela ordem `(created_at, id)` (o `id` desempata). Exceções: a luz conta pela `light_order` da cena (a ordem de criação, que desempata as de um mesmo `insertMany`; [`../lights.md`](../lights.md)); sem `created_at` próprio, a barra e a forma contam pela posição no token e a patrulha pelo `(created_at, id)` do token ([`../tokens/plano.md`](../tokens/plano.md)). Os N mais antigos seguem editáveis; apagar um deles destrava o próximo.
- Grupo de cada recurso: a mesa (`scenes`, `libraryMaps`, `sheetTemplates`), o documento (`documentTabs`), a cena (`lights`, `patrols`, `sightBlockers`), o token (`tokenBars`, `tokenForms`) e o membro (`savedRolls`).
- Passa sempre com limite `null` e com limite igual ou acima do teto técnico (o valor do `amigo_do_dono`), como no `requireRoom`: ali vale o erro técnico de hoje. Por isso, na Lenda, `lights` (100 = técnico) nunca trava pelo plano.
- `PlanEditableResource` é o subconjunto de `PlanCountResource` que trava: `scenes`, `libraryMaps`, `sheetTemplates`, `documentTabs`, `savedRolls`, `lights`, `tokenBars`, `tokenForms`, `patrols`, `sightBlockers`. Ficam de fora as mesas como dono, os membros, o armazenamento, as pastas de rolagem e as fichas de NPC (o teto delas só barra a criação; os valores são jogo).
- O erro: `stored` = a posição do item contada de 1 (`rank + 1`), `adding: 0`, `limit` = o teto, `plan` = o da grade. Mensagem com o nome singular do recurso (`EDITABLE_ITEM_NAME`): `scene 4 of plan free is read only (plan allows 3)`, `library map 1 of plan free is read only (plan allows 0)`.
- Uso: o service chama só na mudança de **configuração**, na transação da escrita, depois do `lockWithOwner`, com o `rank` de uma consulta do DAO (`count(*)` dos que têm `(created_at, id)` menor no mesmo grupo). Jogo e apagar não passam por aqui.

## O que é jogo e o que é configuração

- Jogo (livre no item travado):
  - no grid: mover token, combate, ping, chat, dados, desenho, área de efeito e acender, apagar ou excluir luz;
  - na ficha de NPC: os valores (HP, campos);
  - na barra: o valor atual;
  - em luz, patrulha e bloqueador: ligar e desligar, que só diminui o uso (religar passa pelo `requireRoom`).
- Configuração (trava):
  - o grid: nome, pasta, tamanho, régua, linhas, fundo, paredes e portas (criar, mover, mudar o tipo, apagar), luzes (criar e configurar) e duplicar; visibilidade, "Visão dos tokens", "Movimento livre", ativar e abrir, fechar ou trancar porta seguem livres;
  - o mapa: nome, pasta, visibilidade e regiões (lugares e pinos); Principal, "Mostrar a todos" e apagar seguem livres;
  - o modelo: todo `update` (nome, pasta, arquivos, manifesto); criar ficha a partir dele segue livre;
  - a aba: o conteúdo e o nome; ocultar, reordenar e apagar seguem livres;
  - a rolagem salva: a fórmula e o nome; mover para pasta segue livre;
  - a barra: nome, máximo, cor e a ordem;
  - a forma: a imagem e o nome;
  - a luz: posição, alcance, cor e cone;
  - a patrulha rodando: a rota.

Provado em `server/test/modules/plans/plan-limits.bo.spec.ts` (`PlanLimitsBo.requireEditable`, `the reason of a PLAN_LIMIT`) e `plan-limit-response.spec.ts` (o corpo com `reason: 'readOnly'`). Integração por recurso (Postgres, `amigo_do_dono` para criar e o dono descido ao `free` depois): `grid-read-only.spec.ts` (grids, paredes, `scene:configure`, snapshot, jogo e porta no 5º grid, isolamento por mesa), `library-read-only.spec.ts` (mapas e modelos), `documents-plan-limit.spec.ts` (abas), `saved-rolls-plan-limit.spec.ts` e `token-plan-read-only.spec.ts` (barras, formas, patrulha, bloqueador, luzes).
