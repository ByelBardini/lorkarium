# Auth · cifra de dados e e-mail cifrado

Detalhe do hub [`auth.md`](../auth.md): a porta de cifra, o e-mail em repouso, o @ e as migrações `0037`–`0039`.

## Porta `DataCipherPort` (`server/src/modules/auth/data-cipher.port.ts`)

- `seal(finalidade, texto, contexto)` → texto cifrado; `open(finalidade, cifrado, contexto)` → texto (lança com outra chave, finalidade ou contexto, ou dado adulterado; a mensagem cita a finalidade, nunca o texto); `index(finalidade, valor)` → índice cego determinístico (igualdade e unicidade). Síncrona.
- `CipherPurpose` = `user-email` | `pending-email` | `invitation-email` | `totp-secret` | `email-index` | `recovery-code` (`invitation-email`: o endereço de um convite do backoffice, contexto = id do convite; ver `account-links.md`).
- Adaptador `AesGcmDataCipher` (`server/src/infrastructure/data-cipher/aes-gcm-data-cipher.ts`, `node:crypto`): subchave por HKDF-SHA256 da chave mestra (sal fixo `lorkarium/data-cipher`, `info` = `seal:<finalidade>` ou `index:<finalidade>`, guardada em memória); AES-256-GCM com IV aleatório de 12 bytes e tag de 16; formato `v1.<iv>.<cifra>.<tag>` em base64url; o contexto entra como AAD. `index` = HMAC-SHA256 hex (64 caracteres). Versão desconhecida → `unsupported <finalidade> cipher version "v9"; expected v1` (o `v1.` é o gancho da rotação de chave futura). Chave com tamanho errado no construtor lança citando o tamanho.
- Chave: `DATA_ENCRYPTION_KEY` (32 bytes em base64), validada no boot pelo `readEnv` → `env.dataEncryptionKey: Buffer` (ver `server.md`, Env). Instanciado uma vez no `buildApp` e passado ao `createAuthModule({ …, cipher })`; as outras raízes (`dev-seed.ts`, `encrypt-emails.ts`, o preparo do e2e) criam o seu com a mesma env.

## E-mail em repouso

- A linha guarda `email_cipher` (`seal('user-email', email, id)`: o **id** é o contexto, então o cifrado de uma conta não abre como o de outra) e `email_index` (`index('email-index', email)`, **único**). O e-mail em claro não existe mais no banco.
- O e-mail chega já minúsculo pelo DTO (`loginRequestDto`) ou pela env (`ADMIN_EMAIL`); o índice é calculado sobre esse valor normalizado.
- `auth.mapper.ts`: `toSealedEmail(cipher, id, email)` → `{ emailCipher, emailIndex }` (todo insert de conta passa por ele); `emailIndexOf(cipher, email)` (toda busca); `toAuthUserDto(row, cipher)` abre o e-mail com o id.
- Quem cria conta gera o id antes (`newId`, `randomUUID` no plugin e nas raízes), porque o cifrado depende dele.
- `UsersDao`: `findByEmailIndex`, `findById`, `findByUsername`, `usernamesStartingWith(prefixo)` (`starts_with`, sem curinga de `LIKE`: `_` é letra do @), `insert` (só com os cifrados), `listPlainEmails()` e `sealEmail(id, { emailCipher, emailIndex })` (os dois em SQL cru: o PO não tem mais `email`).

## O @ (`username.bo.ts`)

- `usernameFromEmail(email, tomados)`: parte local antes do `+`, minúscula, só `a-z 0-9 . _`; vazia → `jogador`; menos de 3 → `<x>.rpg`; até 20; tomado → `2`, `3`… com o tronco cortado para o sufixo caber (`uniqueUsername(tronco, tomados)`). `usernameLookupPrefix(tronco)` (os 15 primeiros) é o que buscar no `usernamesStartingWith` para `tomados` ter todo @ que colidiria.
- Admin do seed: `@admin` fixo (`admin2`… se alguém já o tem), `name` = o @. Bia e Caio: `@bia` e `@caio` fixos (`DEV_PLAYERS`), nomes Bia e Caio. O seed de estresse acha os dois pelo @ (`findByUsername`), não pelo e-mail.
- A migração `0037` preenche as contas antigas pela mesma regra em SQL (CTE com `row_number()` por tronco, a mais antiga fica sem sufixo). Diferença conhecida: o SQL não enxerga um @ natural que coincida com um sufixado (duas `bia@` e uma `bia2@`); aí o `UNIQUE` falha a migração em vez de gravar repetido.

## Migrações

| Migração                | O que faz                                                                                                                                                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `0037_user_profile`     | enum `member_color` (os 8 nomes do game-core, mesma ordem); `username` (preenchido, depois `NOT NULL` + único), `color` (nulo = automática), `bio` (`CHECK char_length ≤ 190`), `avatar_id`, `password_changed_at` |
| `0038_email_cipher`     | `email_cipher` e `email_index` (único), ainda nulos; `email` deixa de ser `NOT NULL`                                                                                                                               |
| `0039_drop_plain_email` | guarda `DO $$ … RAISE EXCEPTION` se sobrou conta sem cifra (a mensagem manda rodar `pnpm db:encrypt-emails`); depois `email_cipher`/`email_index` `NOT NULL` e `DROP COLUMN email`                                 |

- O migrador do Drizzle roda **todas** as pendentes numa transação só: a recusa da `0039` desfaz também a `0037` e a `0038`. Por isso o `pnpm db:encrypt-emails` (`server/src/encrypt-emails.ts`) faz `runMigrationsThrough(db, '0038_email_cipher')` (`src/database/migrate.ts`, cópia do `drizzle/` com o journal cortado), cifra pelo `EmailEncryptionBackfillService` e então roda o resto (`runMigrations`). Rodar de novo cifra 0.
- `EmailEncryptionBackfillService(users, cipher).run()` → `{ updated }`: cifra cada linha com `email_cipher` nulo e zera o `email`. Roda também no boot (`createAuthModule`, **antes** do seed do admin, que busca pelo índice): passada a `0039` é um no-op (o `listPlainEmails` vê que a coluna sumiu); antes dela, termina um `db:encrypt-emails` que parou entre a `0038` e o backfill. Fica (com o script) enquanto houver banco anterior à `0039` para atualizar.

## Testes

- Unit: `server/test/infrastructure/data-cipher/aes-gcm-data-cipher.spec.ts` (cifra real), `test/modules/auth/username.bo.spec.ts`, `email-encryption-backfill.service.spec.ts`, e os specs do service, mapper e seeds com o `DataCipherFake`.
- `DataCipherFake` (`test/support/auth-fakes.ts`): `seal` = `sealed:<finalidade>:<contexto>:<texto>`, `index` = `idx:<finalidade>:<valor>`, `open` desfaz e lança com outra finalidade ou contexto. `UsersDaoFake.lookedUp` guarda os índices consultados (nunca um e-mail em claro); `plain`/`sealed` alimentam o backfill.
- Fábricas (`test/support/auth-factories.ts`): `newUserPo({ email })` e `userPo({ email })` aceitam o e-mail em claro e gravam o @ (parte local) e os cifrados no formato do fake (`fakeSealedEmail`); nenhuma chave real abre esse cifrado.
- Integração: `test/support/sign-in.ts` — `testDataCipher()` (a chave da env da integração) e `insertTestAccount(db, { name, email, password })` para contas que o login HTTP real precisa achar; `signUpAndLogin` usa os dois. `user-profile-migration.spec.ts` (o @ das contas antigas) e `email-cipher-migration.spec.ts` (a recusa, o backfill e o caminho do script a partir da `0036`).
- Spec de migração que semeia `users` em SQL cru numa migração antiga para em `LAST_MIGRATION_WITH_PLAIN_EMAIL` (`0038`, em `test/support/migrations-up-to.ts`), nunca no `MIGRATIONS_FOLDER`: a `0039` recusaria a conta sem cifra.
