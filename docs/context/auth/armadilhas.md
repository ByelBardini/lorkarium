# Auth · armadilhas

Hub: [`auth.md`](../auth.md).

- Em `preHandler` assíncrono que responde (guarda), é `return reply.code(...).send(...)`: sem o `return` o Fastify segue para o handler.
- `errorResponseBuilder` do rate-limit **lança** o que devolve: ele devolve `RateLimitedError`, que o error handler do módulo traduz. O header `Retry-After` já vem posto pela lib.
- E-mail e @ da mesma conta são **baldes diferentes** do rate limit (5 + 5 por minuto por IP): aceito; juntar exigiria achar a conta antes de contar a tentativa.
- O balde do login é `request.ip|identificador`, então o rate limit só vale com o `TRUST_PROXY` certo (ver `server.md`, Env): `0` atrás do Traefik junta todo mundo no IP do proxy (um errando a senha bloqueia a mesa toda); salto demais deixa o cliente forjar o `X-Forwarded-For` e fugir do limite. Provado em `test/integration/trust-proxy.spec.ts`.

- A tabela é `auth_sessions`, não `sessions`: o spec §6 reserva `Session` para a sessão multiplayer.
- Erro do Postgres chega embrulhado pelo Drizzle: o código (`23505` = unicidade) está em `error.cause.code`, não em `error.code`.
- `Algorithm` do `@node-rs/argon2` é `const enum`: com `isolatedModules` não dá para importar o valor. O adaptador usa `2` tipado como `Algorithm` (é o Argon2id, e também o padrão da lib).
- Busca por e-mail em SQL não funciona mais (`WHERE email = …`, `users.email`): o e-mail só existe cifrado. Use o índice — `findByEmailIndex(emailIndexOf(cipher, email))` — ou, para as contas de seed, o @ (`findByUsername`). Insert de conta sempre por `toSealedEmail(cipher, id, email)`, com o `id` gerado antes.
- Puxar as fases 4 e 5 juntas (ou atualizar um banco anterior à `0037`): o `pnpm db:migrate` do `pnpm dev` para na guarda da `0039` e desfaz tudo (uma transação só). Rode `pnpm db:encrypt-emails` (migra até a `0038`, cifra com a `DATA_ENCRYPTION_KEY` do `server/.env` e aplica o resto) e suba de novo. Spec de migração que semeia `users` cru numa migração antiga migra só até `LAST_MIGRATION_WITH_PLAIN_EMAIL`.
