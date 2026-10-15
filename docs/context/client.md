# Client

SPA React 19 + Vite 8 em `client/` (alias `@/*` → `src/*`). Tela em `src/features/<área>/`, componente compartilhado em `src/components/`, rede em `src/services/`, estado em `src/stores/`, tabuleiro (futuro) em `src/renderer/`.

> **Detalhe por assunto em [`client/`](client/) — abra só o arquivo da tarefa.** Este hub guarda a estrutura e os testes.

| Assunto                                                        | Arquivo                                       |
| -------------------------------------------------------------- | --------------------------------------------- |
| Tokens de cor, tipografia, componentes base e regras de visual | [`design-system.md`](client/design-system.md) |

## Estrutura

- `src/main.tsx` — monta `createBrowserRouter(buildRoutes({ authApi: new HttpAuthApi(new FetchHttpTransport()), sessionStore }))`
- `src/app/router.tsx` — `buildRoutes(deps)`: rotas do modo data do React Router 8 (abaixo); `deps` = `{ authApi, sessionStore }`, para o teste injetar fakes
- `src/app/route-access.ts` — `decideAccess(session, access, url)`: decisão pura `allow` | `redirect` por `RouteAccess` (`public-only`, `signed-in`, `admin`)
- `src/app/splash-screen.tsx` (`role="status"`, "Carregando…") e `src/app/route-error-screen.tsx`
- `src/features/auth/` — tela de login (ver [`auth.md`](auth.md)); `src/features/home/home-page.tsx` e `src/features/admin/admin-page.tsx` — placeholders
- `src/index.css` — tokens do tema (único, escuro) e as fontes self-host (`@fontsource-variable`)
- `src/components/ui/` — componentes shadcn (`button`, `input`, `label`, `checkbox`, `alert`), já ajustados ao design system
- `src/components/brand-mark.tsx` — `BrandMark` (logo; variante `compact`)
- `src/lib/utils.ts` — `cn`
- `src/lib/safe-redirect.ts` — `safeRedirectTarget(next)`: só caminho interno; `//x`, `/\x`, URL absoluta, `javascript:`, vazio e `/login` viram `/`
- `src/services/http-transport.ts` — `HttpTransport` (interface), `FetchHttpTransport` (base `/api`, JSON, `credentials: 'same-origin'`), `NetworkUnavailableError`; resposta com `body` JSON, `null` se vazia, `undefined` se não-JSON
- `src/services/auth-api.ts` — `AuthApi` / `HttpAuthApi`: valida cada resposta pelo DTO e devolve `AuthResult` (`{ ok, value }` ou `{ ok: false, failure }`, nunca lança); falhas `invalid_credentials` (401), `rate_limited` (429, segundos do `Retry-After`), `offline` (rede), `unexpected` (resto, ou corpo fora do DTO)
- `src/stores/session-store.ts` — `createSessionStore()` (Zustand vanilla), singleton `sessionStore`, hook `useSession(store)`; estado `unknown` → `authenticated { user }` | `anonymous`

## Rotas

| Caminho  | Acesso        | Tela                                                         |
| -------- | ------------- | ------------------------------------------------------------ |
| `/login` | `public-only` | `LoginPage`; logado vai para o `next` seguro ou `/`          |
| `/`      | `signed-in`   | `HomePage` ("Olá, {nome}", Sair, link Backoffice para admin) |
| `/admin` | `admin`       | `AdminPage`, carregada por `lazy`                            |
| `*`      | —             | redireciona para `/`                                         |

- O root tem `middleware` que faz **um** `GET /api/auth/me` enquanto a sessão está `unknown` e o `HydrateFallback` (splash) cobre essa espera. Cada rota tem um `middleware` de guarda que chama `decideAccess` e lança `redirect`.
- Visitante em rota protegida vai para `/login?next=<caminho+query codificados>`; depois do login, `safeRedirectTarget(next)`.
- A guarda do client só evita mostrar a tela errada; quem recusa é o server.

## Regras de arquitetura

- Componente shadcn novo entra por `pnpm exec shadcn add <nome> -y` (rodado em `client/`) e é ajustado aos tokens do design system no próprio arquivo.
- Texto de interface em pt-BR; identificadores em inglês.
- Rede só por `src/services/` sobre `HttpTransport`; serviço devolve falha como valor (`AuthResult`), a tela só traduz o `kind` em mensagem.
- Em dev, o Vite faz proxy de `/api` para `http://localhost:3333` (`client/vite.config.ts`); em produção é a mesma origem. Sem CORS e com cookie first-party.

## Testes

- Vitest do projeto `@lorkarium/client` em `jsdom` (`client/vite.config.ts`, bloco `test`); specs em `client/test/` espelhando `src/` e importando por `@/...`.
- `client/test/setup.ts` carrega o jest-dom e faz `cleanup` depois de cada `it` (sem globals do Vitest, o Testing Library não se limpa sozinho).
- `client/test/jest-dom.d.ts` tipa os matchers do jest-dom no `Matchers<R, T>` do Vitest 5.
- `client/test/support/http-transport-fake.ts` — `HttpTransportFake` (`respondWith(status, body, headers)`, `failWithNetworkDown()`, `requests`).
- Componente se prova pelo que o usuário vê: `getByRole`/`getByLabelText` + `toHaveTextContent`/`toBeDisabled`/`toHaveAttribute`, não classe CSS.

## Armadilhas

- No modo data, o `middleware` do root já mantém a navegação inicial pendente e mostra o `HydrateFallback`; não precisa de `loader` só para isso.
- Playwright: `getByLabel('Senha')` casa por substring e pega também o botão "Mostrar senha"; use `{ exact: true }`.

- O jsdom não tem `ResizeObserver` e o Checkbox do Radix usa um: `client/test/setup.ts` instala o `ResizeObserverStub`.
- `react-hooks/refs` (React Compiler) acusa "Cannot access refs during render" em qualquer leitura de um objeto que **carrega** um ref (`form.submitting` quando `form` tem `emailRef`). Desestruture o retorno do hook.

- No `jsdom`, `await expect(p).rejects.toThrow(/regex/)` sobre subclasse de `Error` lê a mensagem como `''`. Use `rejects.toBeInstanceOf(X)` + `rejects.toMatchObject({ message: expect.stringContaining(...) })`.

- `@custom-variant dark (&)` no `index.css`: o app só tem tema escuro, então todo `dark:` dos componentes shadcn vale sempre. Não reintroduzir a classe `.dark`.
