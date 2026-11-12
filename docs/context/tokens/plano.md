# Tokens e o plano do dono da mesa

Os tetos do plano nos comandos de token (barras, formas, tipo de aura, bloqueadores de visão e patrulhas), lidos da trava do grid. A regra efetiva e o erro estão em [`../plans.md`](../plans.md); a grade em [`../contracts/planos.md`](../contracts/planos.md).

## De onde vem o plano

- `ScenesDao.lockInCampaign` (e `shareInCampaign` / `findGridInCampaign`, o mesmo `select`) junta `users` pelo `campaigns.owner_id`: o `AddressedSceneRow` traz `owner: { role, plan, lorkariumOwner }` (`UserPlanPo`) na mesma consulta. A trava continua só na linha do grid (`of: scenes`). Todo comando que passa pelo `inLockedGrid` tem o plano em `locked.scene.owner`; `effectiveLimitsOf(scene.owner)` dá os limites.
- O `ScenesDaoFake` lê o dono de `owners` (por `campaignId`); sem entrada, `planAccount()` (`amigo_do_dono`, sem teto de plano).

## `TokenPlanBo` (`token-plan.bo.ts`)

- `new TokenPlanBo(limits)`; o `tokenPlanOf(scene)` de `token-transaction.ts` o monta a partir do `owner` da trava. `limits` fica público: é o ponto para outra checagem do mesmo comando (a cor personalizada) ler os limites efetivos da mesa sem consultar de novo.
- `requireNew(sent)`: token criado ou colado (`token:create`, cada cópia do `token:createMany`); tudo o que vem é novo.
- `requireChange(held, sent)`: `token:update`. `held` = `tokenPlanHoldOf(linha)` (barras, formas e `auraKind` guardados; no ligado, os do personagem, que o DAO já compõe); `sent` = `tokenPlanSentOf(comando)` (`forms` e `aura` ausentes não contam).
  - Barras e formas: `PlanLimitsBo.requireRoom('tokenBars' | 'tokenForms', guardadas, enviadas − guardadas)`. Quem tem 5 barras de antes da descida edita o nome com as mesmas 5 (`adding` 0) ou tira barras; só passar do que tem e do teto recusa.
  - Aura: `kind` fora de `limits.auraKinds` → `requireFeature('auraKind')`, salvo se o token já tem aquele tipo (manter a aura de efeito de antes passa). `null` (tirar) e ausente passam.
- `requireAuraOnEach(holds, aura)`: `token:restyleMany`, uma vez por token do grupo (tudo ou nada), com o `tokenPlanHoldOf` de cada linha: tipo e cor da aura.
- Cor personalizada (`customColor`): `TokenPlanHold.colors` (barras, aura e luz guardadas) e `TokenPlanSent.colors` (barras e luz enviadas; a da aura vem em `aura.color`); `requireColors(guardadas, enviadas)` recusa só o hex que o token ainda não usa (`CustomColorPlanBo.requirePaletteUnlessHeld`, ver [`../plans.md`](../plans.md)). Roda dentro do `requireNew`, do `requireChange` e do `requireAuraOnEach`.
- `requireBlockers(guardados, novos)`: `sightBlockers` por cena; chamado pelo `admitBlockersOf(daos, scene, regras, novos)` antes do `TOKEN_BLOCKER_LIMIT` técnico, com a mesma contagem.
- Patrulhas: `TokenPatrolBo` recebe `plan` no estado; o `start` chama `requireRoom('patrols', rodando, que_começam)` antes do `TOKEN_PATROL_LIMIT`. Pausar, salvar ou tirar a rota não conta.
- Ordem no serviço: depois da trava e do achar o token, antes de contar tokens e de gravar; recusa não grava, não sobe versão nem publica. O ack leva `planLimit` pelo `toAckError` do `board-command-edge.ts`.

## Barras pelo SDK da ficha e pelo modelo

- `SheetBarCreationBo(sheetId, limits)`: `barCap` = `limits.maxBarsPerToken`; o rótulo pulado pelo teto é `PLAN_LIMIT` `tokenBars` abaixo do teto técnico e `BAR_LIMIT` nele. O `SheetBarCreationService` trava por `lockWithOwner`.
- `giveManifestBars`: no token solto, o teto é o do plano lido na trava do grid; no personagem, o `limits` do `ManifestBarsGift` (sem ele, o técnico). Rótulo além do teto sai em `skippedBars`, sem erro.

## Testes

- Unit: `token-plan.bo.spec.ts`, `token-patrol.bo.spec.ts` (free, narrador, pausar), `token-transaction.spec.ts` (`admitBlockersOf` no free), `sheet-bar-creation.bo.spec.ts`, `manifest-bar-writes.spec.ts` (Bram no free para em 2).
- Integração `board-plan-limit.spec.ts`: mesa `free` recusa 3 barras (criar, editar, colar), 3 formas, aura de efeito/imagem (criar, editar, restyle), bloqueador, ligar patrulha, a 16ª luz e a 3ª barra do SDK (403); 5 barras antigas editam o nome; pausar passa; `amigo_do_dono` aceita 8 barras, efeito, bloqueador e 16 luzes; o comando na Quelm lê o plano do Caio. Spec de integração de token que usa mais de 2 barras ou formas, aura de efeito/imagem, bloqueador, patrulha ou mais de 15 luzes põe o dono em `amigo_do_dono` (`setAccountPlan`).
