# Account security · recuperação por link ("Não fui eu")

Detalhe do hub [`account-security.md`](../account-security.md). Os avisos de troca de senha, pedido de troca de e-mail e e-mail trocado levam um botão "Não fui eu" com um link de 7 dias para `/account/recover#token=…`. Quem usa o link desfaz o que houve, escolhe uma senha nova no mesmo passo e todos os aparelhos saem da conta. Plano de origem: `docs/plans/2026-10-24-emails-do-sistema.md` (fases 6–9).

## Tabela (`0044_account_recovery_tokens`)

- `account_recovery_tokens`: `id` = SHA-256 do token (PK; o token só viaja no e-mail), `user_id` → `users.id` **on delete cascade** (índice `account_recovery_tokens_user_id_idx`; vários links por conta), `kind` enum `account_recovery_kind` (`cancel-email-change` | `revert-email-change` | `revert-password-change`), `email_cipher`/`email_index` nulos, `expires_at`, `created_at`.
- `CHECK account_recovery_tokens_email_only_on_revert`: o endereço existe **se e só se** `kind = 'revert-email-change'`. Ele é o e-mail **antigo**, selado como `user-email` com o id da conta como contexto (`toSealedEmail`), então a volta copia as duas colunas para `users` como estão.
- DAO `AccountRecoveryTokensDao` (`insert`, `findById`, `deleteById` → `boolean`, `deleteAllOf(userId)` → contagem), sobre `DatabaseExecutor` (aceita `tx`).

## Quem emite qual `kind`

| Aviso                     | `kind`                   | Guarda                  | O `check` mostra                                      |
| ------------------------- | ------------------------ | ----------------------- | ----------------------------------------------------- |
| senha trocada             | `revert-password-change` | —                       | `email: null`                                         |
| pedido de troca de e-mail | `cancel-email-change`    | —                       | o pendente, mascarado (ou `null` se já não há pedido) |
| e-mail trocado            | `revert-email-change`    | o e-mail antigo, selado | o antigo, mascarado                                   |

`AccountRecoveryService.issue(userId, kind, antigo?)` grava `hash(token)` com `recoveryExpiry(agora)` e devolve o link (`${APP_PUBLIC_URL}/account/recover#token=…`). Os services de senha e de e-mail recebem `recovery: Pick<AccountRecoveryService, 'issue'>`.

## `recover(token, senhaNova)`

1. Fora da transação: acha o token pelo hash (ausente → `RECOVERY_TOKEN_INVALID`), `AccountRecoveryBo.requireUsable(agora)` (`agora ≥ expires_at` → o mesmo código) e o Argon2 da senha nova.
2. Numa transação (`RecoveryTransactionRunner`, DAOs sobre o `tx`): `deleteById(hash)` é a posse do link (`false` = outro pedido usou antes → `RECOVERY_TOKEN_INVALID`) → `revert-email-change`: o índice antigo de outra conta → `EMAIL_TAKEN` (e o `23505` do `updateEmail` também), senão regrava `email_cipher`/`email_index` → apaga o pedido de troca pendente → `updatePassword(hash, agora)` → `AuthSessionsDao.deleteAllOf` (guarda os ids) → `TwoFactorChallengesDao.deleteAllOf` (um login do invasor pode estar na 2ª etapa) → `deleteAllOf` dos tokens da conta (é isso que faz o link do dono original ganhar quando o invasor trocou o e-mail duas vezes: usar o de A mata o de B).
3. Depois do commit: `sessionEnded(id)` de cada sessão apagada. A rota expira o `lk_session` (`app.authGuards.clearSessionCookie`).

O 2FA **não** é tocado: desligar por e-mail furaria o segundo fator (conta em que o invasor ligou o próprio 2FA fica com o admin). `EMAIL_TAKEN` desfaz tudo (o link continua valendo).

## Client (`/account/recover`)

`features/account/account-recovery-{page,form,action,messages}.ts(x)`, rota fora do shell com guarda `anyone` (`<title>Lorkarium · Recuperar conta</title>`). O token sai do fragmento por `useFragmentToken`; a página confere (`intent: 'check'`, "Conferindo o link…"), mostra o título pelo `kind` ("Recuperar sua conta", "Cancelar a troca de e-mail", "Voltar o e-mail da conta para l****@x.com") e o campo "Senha nova" (`newPasswordDto` antes de pedir). Sucesso: `sessionStore.signedOut()` e "Todos os aparelhos saíram da conta. Entre com a senha nova." com "Entrar". Link morto (no check ou no envio) ou sem token: "Esse link venceu ou já foi usado.", sem formulário. `email_taken`: "O e-mail antigo já está em outra conta. Fale com quem administra o Lorkarium.". Serviço: `accountSecurityApi.checkRecovery(token)` e `.recover(token, senha)` (`recovery_token_invalid`).

## Testes

- Unit: `server/test/modules/account-security/account-recovery.{bo,service}.spec.ts` (fakes; a transação é um runner que escreve `commit` no diário, e o `sessionEnded` só aparece depois dele).
- Integração: `account-recovery-dao.spec.ts` (hash, isolamento por conta, cascade, o `CHECK`) e `account-recovery.spec.ts` (links tirados do `MailerFake`: os três `kind`, precedência A→B→C, vencido, `EMAIL_TAKEN` desfeito, isolamento, 2FA mantido, 429 por IP).
- Client: `client/test/features/account/account-recovery-page.spec.tsx` e os casos de `checkRecovery`/`recover` em `client/test/services/account-security-api.spec.ts`.
