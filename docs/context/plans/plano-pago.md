# Plano pago

O plano comprado pelo gateway mora em duas colunas de `users`, ao lado do plano do admin (`users.plan`). Quem grava cada uma: o backoffice só o `plan`; o serviço de cobrança (outra aplicação, papel próprio no Postgres com `UPDATE` só nessas duas colunas) só o pago. A regra efetiva está no hub [`../plans.md`](../plans.md).

## Colunas (`server/src/modules/auth/users.po.ts`, migração `0115_paid_plan`)

- `paid_plan` (`user_plan`, nula) e `paid_plan_until` (`timestamptz`, nula).
- `CHECK users_paid_plan_pair`: as duas nulas ou as duas preenchidas.
- `CHECK users_paid_plan_sold`: o pago só pode ser `apoiador`, `narrador` ou `lenda` (o `amigo_do_dono` não se vende).
- O `paid_plan_until` já inclui os 7 dias de carência depois do fim do período pago: este lado não conhece regra de cobrança, só compara com o `now()` do banco.
- O `drizzle.config.ts` filtra `schemaFilter: ['public']`: o schema `billing` do serviço de cobrança nunca entra numa migração daqui.

## Leitura

- `activePaidPlanSql(tabela = users)` (`users.dao.ts`) → `CASE WHEN paid_plan_until > now() THEN paid_plan END`: o pago enquanto vale, `null` depois, sem job de vencimento. Aceita um alias (`activePaidPlanSql(ownerUsers)` no `campaign-members.dao.ts`).
- Entra como `paidPlan` em `PLAN_ACCOUNT_COLUMNS` e nos selects que montam o plano à mão (`campaign-members.dao.ts`, `friendships.dao.ts`, `profiles.dao.ts`, `profile-card.dao.ts`); `UserPlanPo.paidPlan` é sempre o vigente.
- `effectivePlanOf({ plan, paidPlan })` (`plan-limits.bo.ts`) → o maior dos dois na ordem de `USER_PLANS` (`free` < `apoiador` < `narrador` < `lenda` < `amigo_do_dono`); `paidPlan` ausente ou `null` = só o `plan`. `effectiveLimitsOf` e `customizationAllowed` usam ele; admin e Dono continuam no `amigo_do_dono`.

## Provas

- `server/test/modules/plans/plan-limits.bo.spec.ts` ("the paid plan against the plan of the admin", `effectivePlanOf`).
- `server/test/integration/paid-plan-columns.spec.ts`: pago até amanhã lido, vencido há um segundo `null`, os dois `CHECK`s, `lockWithOwner` com o pago do dono.
- Fakes: `planAccount()` (`test/support/plan-account-fakes.ts`) nasce com `paidPlan: null`; `userPo()` com as duas colunas nulas.
