# Client · Links de conta (convite e nova senha)

Hub: [`../client.md`](../client.md). As páginas públicas de quem recebeu um link do backoffice. Plano de origem: `docs/plans/2026-10-24-tela-backoffice-usuarios.md` (fases 12–13). Server: [`../account-links.md`](../account-links.md).

## Rotas (`src/features/account-links/account-link-routes.tsx`)

- `/invite` e `/reset-password` — filhas do root, **fora do shell**, guarda `anyone` (logado ou não). As duas usam o `accountLinksAction(deps)`: intenções `inspect-invitation`, `accept`, `inspect-reset`, `complete-reset` (JSON validado por `z.discriminatedUnion` sobre os DTOs do contracts).
- O token sai do fragmento por `useFragmentToken` e a consulta roda uma vez ao montar (`useOnceOnMount`); nada é consumido sem clique.
- Moldura: `AuthFrame` (`features/auth/auth-frame.tsx`, extraída da `LoginPage`: painel ilustrado em `lg+`, ornamento, `h1`, `lead` e conteúdo).

## `/invite` (`invite-accept-page.tsx`, `invite-accept-form.tsx`)

- "Bem-vindo ao Lorkarium" + "Convite para marina@exemplo.com"; enquanto confere, "Conferindo o convite…".
- Formulário: "Seu @" preenchido com a sugestão (`suggestedUsername`; dica "Letras minúsculas, números, ponto e _. Não muda depois."), "Senha" e "Repita a senha" (`PasswordField`, `new-password`), "Manter conectado", a caixa "Li e aceito os Termos de uso e a Política de privacidade" (`terms-acceptance-field.tsx`: os dois nomes são `LegalDocumentLink`, nova aba, sem marcar a caixa) e "Criar minha conta" ("Criando sua conta…"). Validação antes do pedido (`account-links-messages.ts`: `usernameProblem` sobre o `usernameDto` → "Use de 3 a 20 caracteres." / "Use só letras minúsculas, números, ponto e _."; `passwordProblems` → mínimo de 8, máximo 256, "As senhas não são iguais."; caixa desmarcada → `TERMS_NOT_ACCEPTED` "Para criar a conta, aceite os Termos de uso e a Política de privacidade." sob a caixa, com `aria-invalid`), foco no primeiro campo errado (@, senha, repetição, caixa). Sem a caixa nada é enviado; marcada, o pedido leva `acceptedTerms: true`.
- A página passa `legalLinks={false}` ao `AuthFrame`: a caixa já tem os dois links, o rodapé os repetiria.
- `username_taken` → "@marina já tem dono. Tente outro." no campo do @, focado. `rate_limited`/`offline`/`email_taken`/… → `Alert`.
- Aceito: a ação faz `sessionStore.signedIn(user)` e `redirect('/')` (a home saúda pelo apelido, que nasce igual ao @).
- Link morto (no inspect ou no aceite) ou sem token: "Esse link venceu ou já foi usado. Peça um novo a quem te convidou.", sem formulário.
- Aberta logada: "Você está conectado como @caio. Para aceitar este convite, saia primeiro." + "Sair e continuar" (fecha as mesas da aba, `authApi.logout()`, `signedOut()`, depois o formulário). Quem estava logado é lido **uma vez**, ao abrir (ver armadilhas).

## `/reset-password` (`password-reset-page.tsx`)

- "Nova senha para @biaflor"; "Senha nova" e "Repita a senha nova"; "Trocar senha" ("Trocando…"). Sucesso: a ação faz `signedOut()` (todas as sessões caíram no server) e a página diz "Senha trocada. Entre com a nova senha." + "Entrar" (→ `/login`).
- Link morto ou sem token: "Esse link venceu ou já foi usado. Peça um novo a quem administra o Lorkarium."

## Serviço

- `services/account-links-api.ts` — `AccountLinksApi` / `HttpAccountLinksApi`: `inspectInvitation`, `acceptInvitation`, `inspectPasswordReset`, `completePasswordReset`. Falhas `AccountLinksFailure`: `link_invalid` (404 `ACCOUNT_LINK_INVALID`), `username_taken`, `email_taken`, `invalid`, `rate_limited`, `offline`, `unexpected`.
- `AppDependencies.accountLinksApi` (e `userAdminApi`, do backoffice).

## Testes

- `client/test/services/account-links-api.spec.ts`; pelo router `test/features/account-links/invite-accept-page.spec.tsx` (inclusive a caixa do aceite: links, desmarcada não envia) e `password-reset-page.spec.tsx`.
- Fake: `test/support/account-links-api-fake.ts` — `AccountLinksApiFake` (sem roteiro: convite da Marina, link de nova senha da `@biaflor`; `MARINA`).

## Armadilhas

- O aceite assina a sessão **antes** do `redirect`: se a página lesse a sessão ao vivo, o `signedIn` trocaria o formulário pelo aviso "Você está conectado como…", desmontaria o dono do fetcher e o router descartaria o redirect. Por isso quem estava logado é lido uma vez, ao abrir.
