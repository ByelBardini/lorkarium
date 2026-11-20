# Contratos — cobrança (`packages/contracts/src/billing/billing.dto.ts`)

As rotas `/api/billing/*` não são do server do jogo: quem responde é o serviço de cobrança (outra aplicação, mesmo domínio, roteada antes do server no proxy). O client valida tudo com estes DTOs; o serviço espelha os mesmos campos. Valores em **centavos inteiros de BRL**; datas em ISO-8601 UTC.

## Catálogo

- `BILLING_PLANS` = `apoiador`, `narrador`, `lenda` (o `amigo_do_dono` não se vende). `BILLING_PERIOD_MONTHS` = `{ monthly: 1, semiannual: 6, annual: 12 }`.
- `BILLING_PRICE_KEYS`: as nove chaves `<plano>_<período>` (`narrador_monthly`, `lenda_annual`…); `billingPriceKeyDto` recusa outra citando o valor e a lista. `priceKeyPartsOf(chave)` → `{ plan, period, months }`.
- `billingPriceDto` `{ priceKey, plan, period, months, amountCents (inteiro > 0), currency: 'BRL' }`; `billingPricesResponseDto` `{ prices }` — resposta de `GET /api/billing/prices` (pública). O valor mora só no serviço: o client mostra o que vem daqui e manda só a chave.

## Checkout

- `checkoutRequestDto` (estrito) `{ priceKey, method: 'card' | 'pix' }` — corpo de `POST /api/billing/checkout`. A conta vem da sessão; campo a mais (`amount`, `userId`) é recusado.
- `checkoutResponseDto` `{ redirectUrl }`: só `https` num host de `BILLING_CHECKOUT_HOSTS` (`www.mercadopago.com.br`, `mercadopago.com.br`, `sandbox.mercadopago.com.br`); userinfo (`https://host-permitido@outro`) é recusado. A conferência é por regex (o contracts não tem `URL`). O client confere de novo antes de navegar.

## Status, cancelamento e backoffice

- `billingSubscriptionDto` `{ priceKey, method, status: pending | active | cancelled | ended, renews, currentPeriodEnd | null }`.
- `billingStatusDto` `{ paidPlan, paidPlanUntil (com a carência), periodEnd (fim do período pago; entre ele e `paidPlanUntil` = carência), subscription | null }` — `GET /api/billing/status`. Usa `paidPlanFields` + `checkPaidPlanPair` (`plans/paid-plan.dto.ts`).
- `cancelSubscriptionResponseDto` `{ subscription }` — `POST /api/billing/cancel` (sem corpo): para a renovação; o plano fica até o fim do período.
- `billingPaymentDto` `{ id, priceKey, method, amountCents, currency, status: pending | approved | rejected | cancelled | refunded | charged_back, coversFrom | null, coversUntil | null, createdAt }`; `billingAdminSubscriptionDto` = a assinatura + `{ id, createdAt }`; `billingAdminAccountDto` `{ paidPlan, paidPlanUntil, subscriptions, payments }` — `GET /api/billing/admin/accounts/:userId` (só admin).
- `billingAdminCancelResponseDto` `{ subscription: billingAdminSubscriptionDto | null, cancelled }` — `POST /api/billing/admin/accounts/:userId/cancel` (sem corpo, cabeçalho `X-Idempotency-Key`, admin com 2FA ativo): o backoffice para a renovação no cartão de outra conta antes de excluí-la; o serviço cancela no Mercado Pago toda assinatura de cartão ativa dela. Sem nada para cancelar (sem assinatura, só Pix) responde `{ subscription: null, cancelled: false }`, não erro. Recusas: 403 `TWO_FACTOR_REQUIRED`/`FORBIDDEN`, 502 `GATEWAY_UNAVAILABLE` (o Mercado Pago não respondeu; nada fica como cancelado).
- `refundRequestDto` (estrito) `{ paymentId (uuid), reason (10 a 500, com trim) }` + cabeçalho `X-Idempotency-Key` — `POST /api/billing/admin/refunds` (admin com 2FA ativo); `refundResponseDto` `{ payment }`.

## Exportação própria

- `billingExportDto` (estrito) `{ exportedAt, subscriptions, payments }` — `GET /api/billing/export` (sessão da própria conta; 401 `UNAUTHENTICATED`, 403 `ACCOUNT_SUSPENDED`). Listas do mais novo ao mais antigo; conta que nunca pagou recebe as duas vazias. Cada item repete a chave por extenso (`priceKey`, `plan`, `period`, `months`, `method`, `amountCents`, `currency`): `billingExportSubscriptionDto` + `{ id, status, renews, currentPeriodEnd | null, createdAt }`; `billingExportPaymentDto` + `{ id, subscriptionId | null, status, coversFrom | null, coversUntil | null, createdAt, mercadoPagoPaymentId | null }` (o número do pagamento é o único id do Mercado Pago que sai). É o botão "Dados de pagamento" de Minha conta ([`../data-export.md`](../data-export.md)).

## Erros

`BILLING_ERROR_CODES` (no `apiErrorDto.code`): `UNAUTHENTICATED`, `FORBIDDEN`, `ACCOUNT_SUSPENDED`, `BAD_ORIGIN`, `VALIDATION`, `PAYLOAD_TOO_LARGE`, `RATE_LIMITED` (com `retryAfterSeconds`), `ALREADY_SUBSCRIBED`, `NO_ACTIVE_SUBSCRIPTION`, `PAYMENT_NOT_FOUND`, `ALREADY_REFUNDED`, `TWO_FACTOR_REQUIRED`, `GATEWAY_UNAVAILABLE`, `PIX_UNAVAILABLE` (503: a conta que recebe não oferece Pix — sem chave Pix, ou vendedor de teste; nenhuma order é criada).

## Provas

`packages/contracts/test/billing/billing.dto.spec.ts` (catálogo, checkout estrito, host do redirect, motivo do reembolso, centavos, par do pago, cancelamento de admin com a assinatura no formato do backoffice, exportação própria estrita) e `test/plans/paid-plan.dto.spec.ts` (`higherPlanOf`, pago no `accountPlanDto` e no `authUserDto`).
