# Client · Minha conta (perfil e segurança)

A tela em que a pessoa decide como aparece para a mesa (foto, apelido, cor, bio) e cuida da conta (e-mail, senha, aparelhos, 2FA). Plano de origem: `docs/plans/2026-10-24-tela-perfil-e-conta.md` (fases 18–23); mockup: `docs/pages/perfil/Conta.dc.html` (base, não lei). Contrato em [`../contracts/conta.md`](../contracts/conta.md); a 2ª etapa do login em [`../auth.md`](../auth.md) (seção Client).

## Rotas (`src/features/account/account-routes.tsx`)

- `accountRoute(deps)` — filha do `shell` (`id: 'account'`, `path: 'account'`, acesso `signed-in` herdado). `loader` faz em paralelo `profileApi.get()`, `accountSecurityApi.security()` e `.sessions()` (cada um por `valueOrThrow`: `unauthenticated` → `/login?next=%2Faccount`); `action` = `accountAction(deps)`; `ErrorBoundary` = `AccountErrorScreen` com o `sessionStore` (o `AccountSignedOutError` da ação vai ao login pelo `SignedOutRedirect`; o resto sobre o `LoadErrorScreen` de `components/`, o mesmo da home: "Sem conexão" ou "Não deu para carregar sua conta." + "Tentar de novo"). O `now` é fixado uma vez por visita.
- `emailConfirmRoute(deps)` — `/account/email/confirm`, filha do root **fora do shell**, guarda `anyone` (`RouteAccess` ganhou `anyone`: `decideAccess` sempre `allow`). `action` = `emailConfirmAction` (`POST /api/account/email/confirm`; logado, relê o `me` e faz `signedIn`).

- `accountRecoveryRoute(deps)` — `/account/recover`, fora do shell, guarda `anyone`: a página do link "Não fui eu" (ver [`../account-security/recuperacao.md`](../account-security/recuperacao.md), seção Client).

## Ação (`account-action.ts`)

Corpo JSON `{ intent, input? }` revalidado por um `z.discriminatedUnion` sobre os DTOs do contracts; corpo fora dele → `{ intent: null, failure: invalid }`. Um handler por intenção (mapa `HANDLERS`); `unauthenticated` → lança `AccountSignedOutError`, que o `ErrorBoundary` da rota troca pelo `SignedOutRedirect` (`signedOut` + `/login?next=%2Faccount`). O router revalida o `loader` depois de toda ação.

| Intenção                    | Serviço                                         | Resposta ao fetcher            |
| --------------------------- | ----------------------------------------------- | ------------------------------ |
| `profile-update`            | `profileApi.update` (+ `applyProfileToSession`) | `{ done }`                     |
| `avatar-remove`             | `profileApi.removeAvatar` (+ sessão)            | `{ done }`                     |
| `password-change`           | `changePassword`                                | `{ done }`                     |
| `email-change`              | `requestEmailChange`                            | `{ pendingEmail }`             |
| `email-cancel`              | `cancelEmailChange`                             | `{ done }`                     |
| `session-revoke`            | `revokeSession(input.sessionId)`                | `{ done }`                     |
| `sessions-revoke-others`    | `revokeOtherSessions`                           | `{ revoked }`                  |
| `two-factor-setup`          | `setupTwoFactor`                                | `{ setup }` (segredo, URI, QR) |
| `two-factor-enable`         | `enableTwoFactor`                               | `{ recoveryCodes }`            |
| `two-factor-disable`        | `disableTwoFactor`                              | `{ done }`                     |
| `recovery-codes-regenerate` | `regenerateRecoveryCodes`                       | `{ recoveryCodes }`            |

- **Foto por link**: "Usar um link" no campo da foto abre o `ImageLinkField` das imagens da mesa ("Link da imagem" + "Usar link", Enter usa, Esc desiste) sobre o `useAvatarUpload(...).sendLink(url)` → `profileApi.avatarFromLink` (`POST /account/avatar/link`); o campo fecha só quando a foto foi guardada; recusa (`link_blocked`, `link_unreachable`, `link_not_image`, `avatar_too_large`, `rate_limited`) no alerta do campo, com o link ainda digitado. GIF animado continua animado.
- **O envio da foto não passa pela ação**: `useAvatarUpload(profileApi, sessionStore)` chama `profileApi.uploadAvatar(file)` direto (como o `useImageSender` das imagens da mesa) e depois `revalidator.revalidate()`; um `File` não atravessa o submit JSON, e o `FormData` do jsdom não é lido pelo `Request` do Node nos specs. `unauthenticated` → `signedOut()` + login com `next`.
- `use-account-fetcher.ts` — `useAccountFetcher()` (`busy`, `settled` = a resposta só depois da revalidação, `send(pedido)` para `action: '/account'`), `useOnSettled(settled, reagir)` (por `useEffectEvent`, uma vez por resposta nova: fecha diálogo, escreve aviso) e `failureOf(settled)`.
- `session-profile.ts` — `applyProfileToSession(store, perfil)`: o usuário logado ganha `name`, `color` e `avatarId` confirmados (o trilho e o ping mudam sem outro `me`).

## Página (`account-page.tsx`)

Cabeçalho "Minha conta" + linha de descrição; seções separadas por fio (`border-t border-divider`) com título em display (`section-heading.tsx`), sem caixa.

### Perfil (`profile-section.tsx`)

- `useProfileDraft(perfil)` — rascunho = perfil confirmado + edições (`name`, `color`, `bio`); `dirty`, `update` (só o que mudou, pelo `updateProfileRequestDto`; `null` se inválido) e `errors` ao vivo ("O apelido não pode ficar vazio.", "Use no máximo 32/190 caracteres."). Descartar ou salvar (depois da revalidação) zera as edições. A cor confirmada é `colorChoice ?? color`.
- `avatar-field.tsx` — `fieldset` "Foto": círculo (`UserAvatar` `alt="Sua foto"`) dentro da área de soltar (`group` "Área da foto"; arrastando por cima, "Solta aqui"); `label` estilizado como botão com o `input type=file` (`aria-label` "Escolher foto", `accept` de `AVATAR_ACCEPT`); "Tirar foto" (só com foto) pela intenção `avatar-remove`. `avatarFileProblem` (`lib/avatar-file.ts`) recusa antes de enviar (> 5 MB ou tipo fora de `AVATAR_MIME_TYPES`). A foto **não** passa pela barra.
- Apelido (`Input`), "Nome de usuário" `@ana` só de leitura (texto, sem campo), `profile-color-field.tsx` ("Sua cor no mapa": `RadioGroup` com as 8 `MEMBER_COLORS` em círculo, nome pt-BR por `aria-label`, fundo por `memberColorCss`) e "Sobre você" (`Textarea` com contador `N/190`).
- `profile-preview.tsx` — `aside` "Como a galera te vê" (à direita a partir de `lg`): avatar, apelido do rascunho, `@`, "Na mesa desde outubro de 2026" (`lib/member-since.ts`), bio só se houver, e o mini-grid SVG estático com anel, ponto e placa na cor ("Seu ping no mapa").
- `components/unsaved-changes-bar.tsx` (compartilhado com a página "Configurações da mesa"; estado por `lib/unsaved-changes.ts`: `unsavedChangesStateOf`, `useSavedNotice`) — `region` com o rótulo da prop (aqui "Alterações do perfil"; as margens da página vêm por `className`), `sticky bottom-0`, `bg-muted` com borda, sem sombra: "Você tem alterações não salvas." (`role="status"`) + "Descartar" + "Salvar alterações" (submit do form; desabilitado com campo inválido); salvando: "Salvando…" + `aria-busy`; salvo: "Tudo salvo." por 2 s; recusa (ex.: `rate_limited`) num `role="alert"` na barra.
- `leave-without-saving-dialog.tsx` — `useBlocker` só quando `dirty` e o `pathname` muda: `AlertDialog` "Sair sem salvar?" com "Continuar editando" (`reset`) e "Descartar e sair" (`proceed`; `Button` comum, não `AlertDialogAction`, para o fechar não chamar o `reset`).

### Conta e segurança (`security-section.tsx`)

- Linhas (`security-row.tsx`): **E-mail** (atual; com troca pendente, "Aguardando confirmação em b*****@x.com" + "Cancelar troca"), **Senha** ("Trocada há N" por `lib/since-label.ts`, ou "Ainda é a senha da criação da conta.") e **2FA** (`two-factor-row.tsx`: "Desligado" + "Ligar 2FA", ou "Ligado · N códigos de recuperação" + "Gerar novos códigos" + "Desligar").
- Um `role="status"` da seção diz o que cada comando fez ("Senha trocada. Os outros aparelhos saíram da conta.", "Sessão encerrada.", "Os outros aparelhos saíram da conta.", "2FA ligado.", "2FA desligado.", "Troca de e-mail cancelada.").
- Um diálogo por vez, montado só aberto (`account-dialog.tsx`: `AccountDialog`, `DialogFailure`, `DialogButtons` com "Cancelar" e o rótulo de envio).
  - `change-password-dialog.tsx` — atual, nova (8–256, `newPasswordDto`) e repetição ("As senhas não são iguais."); `current_password_invalid` vai para o campo da atual, limpo e focado (remonta por `key`).
  - `change-email-dialog.tsx` — novo e-mail + senha atual (`changeEmailRequestDto`); `email_taken`/`email_unchanged` no campo do e-mail, senha errada no da senha; sucesso fecha e a linha mostra a pendente.
  - `two-factor-setup-dialog.tsx` — três etapas: senha → QR (`img` "QR code para o app autenticador") + chave em grupos de 4 (`groupedSecret`) com "Copiar chave" + "Código do app" (`inputmode=numeric`, `autocomplete=one-time-code`) → `recovery-codes-view.tsx` (os 10 códigos, "Copiar códigos", "Baixar .txt" por `lib/download-text.ts`, "Guardei os códigos"). Fechar antes do código deixa o 2FA desligado. Os códigos só vivem no estado do diálogo.
  - `two-factor-disable-dialog.tsx` — `TwoFactorDisableDialog` e `RecoveryCodesRegenerateDialog` (senha + código do app **ou** de recuperação; o novo lote vem com "Os códigos antigos não valem mais.").
  - `two-factor-form.tsx` — o formulário senha/código dos três: recusa de senha ou de código limpa, foca e escreve sob o campo ("Código incorreto. Confira o app e tente de novo."); o resto vai ao alerta.
- `sessions-list.tsx` — "Onde você está conectado": este aparelho primeiro ("Este aparelho", sem "Sair"), os outros por `lastSeenAt` ("Firefox no Linux" por `deviceLabel` do `@lorkarium/contracts`, "ativo há 2 dias"); "Sair" (`aria-label` "Sair de <aparelho>"); "Sair de todos os outros" (só com outra sessão) pede confirmação em `AlertDialog`. Um fetcher para a lista inteira: a linha encerrada some antes de a resposta assentar.

### Confirmação do e-mail (`email-confirm-page.tsx`)

Lê o token do `#token=…` por `useFragmentToken` (`lib/use-fragment-token.ts`: lê uma vez para o estado e tira o fragmento da URL com `replace`); só confirma no clique ("Confirmar novo e-mail" → "Confirmando…"), porque scanners de e-mail abrem links. Sucesso: "Pronto, seu e-mail foi trocado." com "Entrar" (anônimo) ou "Voltar para as mesas" (logado). `email_token_invalid` ou sem token: "Esse link venceu ou já foi usado. Peça a troca de novo em Minha conta.", sem botão.

## Serviços

- `services/profile-api.ts` — `ProfileApi` / `HttpProfileApi`: `get` (`GET /account/profile`), `update` (`PATCH`), `uploadAvatar` (`PUT /account/avatar`, corpo cru por `callUpload(..., 'PUT')`), `removeAvatar` (`DELETE`). Falhas `ProfileFailure`: as comuns + `avatar_too_large` (413 / `AVATAR_TOO_LARGE`) e `unsupported_image` (415/422 / `UNSUPPORTED_IMAGE`).
- `services/account-security-api.ts` — `AccountSecurityApi` / `HttpAccountSecurityApi`: `security`, `sessions`, `changePassword`, `requestEmailChange`, `cancelEmailChange`, `confirmEmail`, `revokeSession`, `revokeOtherSessions`, `setupTwoFactor`, `enableTwoFactor`, `disableTwoFactor`, `regenerateRecoveryCodes`, `checkRecovery`, `recover` (públicos). O `code` do `ApiErrorDto` vira o `kind` (`current_password_invalid`, `email_taken`, `email_unchanged`, `email_token_invalid`, `session_not_found`, `current_session`, `two_factor_code_invalid`, `two_factor_already_enabled`, `two_factor_not_started`, `two_factor_not_enabled`, `recovery_token_invalid`).
- `services/account-failure.ts` — `AccountResult<T, F>`, `AccountLoadFailure` (`unauthenticated` | `offline` | `unexpected`, compatível com o `valueOrThrow`), `AccountCommonFailure` (+ `invalid`, `rate_limited`), `loadFailureOf(call)` e `commandFailureOf(call, porCódigo)` (código primeiro, depois o status: 400/401/429).
- `HttpTransport.upload(path, file, method = 'POST')` aceita `PUT`; `HttpMethod` ganhou `PUT`.
- Mensagens em `account-messages.ts` (`accountFailureMessage`, `FIELD_MESSAGES`).

## Testes

- Pelo router inteiro com `testDependencies()`: `client/test/features/account/account-route.spec.tsx` (perfil, barra, bloqueio, loader, `describe('foto')`), `security-section.spec.tsx` (e-mail, senha, sessões), `two-factor.spec.tsx`, `email-confirm-page.spec.tsx` e `account-recovery-page.spec.tsx`. Os subcomponentes não têm spec próprio (padrão do hub).
- Fakes: `test/support/profile-api-fake.ts` (`ProfileApiFake`, `ANA_PROFILE`, `UPLOADED_AVATAR_ID`) e `account-security-api-fake.ts` (`AccountSecurityApiFake(now)`, `ANA_SECURITY`, `anaSessions(now)`, `TWO_FACTOR_SETUP`, `RECOVERY_CODES`, `NEW_RECOVERY_CODES`, `PASSWORD_RECOVERY`): guardam a conta como o server (um comando muda o próximo `get`); qualquer método é roteirizado por `answers.answer/hold/clear` (`scripted-answers.ts`, `ScriptedAnswers`), e `answers.callsOf(método)` lista o que foi pedido.
- Unit: `test/services/{profile-api,account-security-api}.spec.ts`, `test/lib/{member-since,since-label,two-factor-text,avatar-file,download-text}.spec.ts`.

## Armadilhas

- `fetcher.state === 'idle'` só depois da revalidação: ler a resposta antes dela mostra a conta velha (o rascunho zeraria e voltaria o apelido antigo por um quadro). Por isso `settled`.
- Sessão caída numa **ação de fetcher** não pode virar `redirectIfSignedOut`: o `signedOut()` faz o `ShellRoute` renderizar `null`, desmonta o dono do fetcher, e o router descarta o redirect de fetcher marcado para exclusão (a tela fica em branco, sem login). Por isso a ação lança `AccountSignedOutError` para o `ErrorBoundary`, que já desmontou o Perfil (e o `useBlocker`) quando o `SignedOutRedirect` sai e navega. O `home-action.ts` ainda usa `redirectIfSignedOut` num fetcher (mesmo risco, sem spec).
- A barra é `sticky` dentro do formulário do Perfil, não `fixed`: `fixed` cobriria o rodapé do trilho (o menu do usuário).
