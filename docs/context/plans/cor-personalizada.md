# Cor personalizada no conteúdo da mesa

Índice: [`../plans.md`](../plans.md).

- `CustomColorPlanBo.requirePaletteUnlessAllowed(cor, limits)` (estático): cor `#rrggbb` (`isHexColor` do contracts) sem `limits.customColor` → `PlanLimitError` `customColor` (`limit: 0`); nome da paleta, `null` e ausente passam. `requirePaletteUnlessHeld(enviadas, guardadas, limits)`: na edição, só o hex que a peça **ainda não tem** é recusado (grandfathering: quem desceu de plano mantém e edita o hex de antes; voltar à paleta passa).
- Plano do **dono** da mesa, lido na trava (o mesmo `owner` dos outros tetos):
  - `drawing:createMany` (`stroke` e `fill`); mover e apagar não olham cor.
  - `effectArea:createMany`; `effectArea:reshapeMany` contra a cor gravada da área.
  - Tokens, pelo `TokenPlanBo`: `TokenPlanHold.colors` (barras, aura e luz guardadas, `tokenPlanHoldOf`) × `TokenPlanSent.colors` (barras e luz, `tokenPlanSentOf`) + `aura.color`, no `requireNew` (`token:create`, cada cópia do `token:createMany`), no `requireChange` (`token:update`) e no `requireAuraOnEach(holds, aura)` (`token:restyleMany`, por token). O método é `requireColors(guardadas, enviadas)`.
  - `light:createMany` e `light:setColorMany` (contra a cor gravada), com `LightRulesBo.plan`.
  - `condition:define` e `condition:updateDefinition` (contra a cor da definição), com `effectiveLimitsOf(locked.owner)`, junto do `requireImageInPlan`.
  - Tom da capa desenhada (`campaign-plan.bo.ts`): `POST /campaigns` pelo `requireCreationCoverTone(cover, limits)` na transação que trava o dono (os limites são os de quem cria); `PATCH /campaigns/:id` pelo `requireCampaignPlanFor`, contra o `cover_tone` gravado (o tom gravado é texto: `'3'` nunca lê como hex). O Apoiador também é recusado (grade da mesa, `customColor: false`).
- Livres em todo plano (não têm paleta): a cor do lugar de mapa e a cor de texto de documento (provado por `library-map-regions.spec.ts`).
- O desfazer de um apagar e a colagem são criação: um hex de antes volta só num plano com `customColor`.
- O tom da capa: `server/test/modules/campaigns/campaign-plan.bo.spec.ts` e `server/test/integration/campaign-plan-limit.spec.ts`; no client, o ladrilho do `cover-picker.tsx` é `scope="table"` e a Nova mesa troca a chave `table` do `CustomColorLocksContext` pelos limites da conta (`create-campaign-form.tsx`).
- Provado em `server/test/integration/custom-color-plan-limit.spec.ts` (um `it` por comando, o grandfathering na reforma, na barra, na condição e no mover, `narrador` aceita tudo, Quelm lê o plano do Caio) e `server/test/modules/plans/custom-color-plan.bo.spec.ts`, `tokens/token-plan.bo.spec.ts`. Spec de integração que grava hex em desenho, área, aura, barra, luz ou condição põe o dono em `amigo_do_dono` (`setAccountPlan`).
