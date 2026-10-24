# Health

Verificação de saúde do server: `GET /api/health` confere se o Postgres responde. Módulo em `server/src/modules/health/`; é a URL de prontidão do `webServer` do Playwright e o _healthcheck_ do futuro container.

## Estrutura

- `health.dao.ts` — `HealthDao.ping()`: `select 1` no `db` recebido pelo construtor
- `health.service.ts` — `HealthService.checkHealth(timeoutMs)` → `{ status: 'ok' }` ou `{ status: 'unavailable', cause }`; nunca lança
- `health.error.ts` — `HealthCheckTimeoutError` (cita o `timeoutMs`)
- `health.routes.ts` — a rota; `HEALTH_TIMEOUT_MS` = 2000
- `health.plugin.ts` — registrado em `src/app/build-app.ts` com o prefixo `/api`

## Contrato

| Situação                                     | Status | Corpo                                            |
| -------------------------------------------- | ------ | ------------------------------------------------ |
| banco respondeu ao `select 1`                | 200    | `healthResponseDto`: `{ status: 'ok' }`          |
| banco recusou, pool fechado ou passou de 2 s | 503    | `apiErrorDto` com `code: 'DATABASE_UNAVAILABLE'` |

## Regras

- **Pública por decisão**: sem cookie de sessão, porque balanceador e sonda do e2e chamam sem conta. O corpo não traz detalhe (versão, host, URL do banco).
- A causa da falha vai só para o `request.log.error` (`err`), nunca para a resposta.
- O timeout existe para o health não pendurar junto com o banco.

## Armadilhas

- O `buildApp` lê `users` no boot (o backfill do e-mail e o seed do admin, ver [`auth/cifra.md`](auth/cifra.md)): app montado sobre pool já fechado nem sobe. O spec do 503 monta o app e **depois** fecha o pool.

## Testes

- Unit: `server/test/modules/health/health.service.spec.ts`, com `FakeHealthDao` (`server/test/support/fake-health-dao.ts`: `answering()`, `failingWith(error)`, `hanging()`).
- Integração (DAO + rota): `server/test/integration/health.spec.ts` — 200 sem cookie e 503 com pool fechado.
