# Legal (Termos de uso, Política de privacidade e Política de uso no app)

Como o app abre e registra os textos legais e oferece o código-fonte. Os textos em si (Markdown, rascunho, LGPD, fornecedor) moram na landing: [`site/legais.md`](site/legais.md). Decisões de 2026-10-25 com o responsável: o app linka a própria origem e o server redireciona para a landing; uma versão (data) para os textos; só as contas novas aceitam (as que já existiam ficam com o aceite nulo, sem tela de re-aceite no login). Em 2026-11-18 entrou a Política de uso aceitável, coberta pela mesma versão, e a mudança dos textos foi publicada sem aviso nem reaceite (decisão do responsável). Em 2026-11-20 (versão atual) os textos passaram a falar do cadastro aberto pelo app, do "esqueci minha senha" e da Cloudflare (Turnstile) como operadora; a idade mínima continua 18+ por autodeclaração.

## Server (`server/src/modules/legal/`)

- `legal.mapper.ts` — `landingPageUrlOf(sitePublicUrl, document)`: `terms` → `/termos/`, `privacy` → `/privacidade/`, `acceptable-use` → `/uso/` (os caminhos das páginas da landing, que os textos citam e não mudam).
- `legal.routes.ts` — `GET /api/legal/terms`, `/api/legal/privacy` e `/api/legal/acceptable-use` **(públicas)**, uma por valor de `legalDocumentDto`: 302 para a página da landing; outro documento é o 404 do Fastify. Sem sessão de propósito: o login e o convite linkam antes de existir uma.
- `legal.plugin.ts` — `legalPlugin`, registrado no `buildApp` com `env.sitePublicUrl`.
- Env `SITE_PUBLIC_URL` ([`server.md`](server.md), Env; [`deploy.md`](deploy.md)): padrão `http://localhost:4321` (`pnpm site:dev`), **obrigatória em produção**, sem barra final (o `readEnv` a tira); o smoke da imagem no CI passa `http://localhost:4321`.
- Por que o redirect: o client não lê `VITE_*` em produção (uma imagem para todo ambiente). No desktop, `target=_blank` para a mesma origem cai no `OpenExternal` ([`desktop.md`](desktop.md)): o navegador padrão abre o `/api/legal/*` e segue o 302.

## Aceite no convite e no cadastro (clickwrap)

- Dois lugares gravam o aceite, pelo mesmo `accept`: o convite do admin (`/invite`) e o cadastro pedido pela própria pessoa (`/sign-up/confirm`, a linha do convite com origem própria; [`account-links.md`](account-links.md)). A caixa diz "Tenho 18 anos ou mais e li e aceito…": a idade não ganha coluna, porque o `terms_version` gravado já prova o aceite dos Termos, que contêm a declaração (§3).
- `POST /api/invitations/accept` exige `acceptedTerms: true` ([`contracts.md`](contracts.md)); o server grava `users.terms_accepted_at` (o relógio do server) e `users.terms_version` = `LEGAL_DOCUMENTS_VERSION`, pelo `termsAcceptanceAt` de `account-links.mapper.ts` ([`account-links.md`](account-links.md)). A versão é a que está em vigor no server, nunca uma que o client diga. A caixa cita os três textos; o server continua exigindo um só `acceptedTerms`, porque a versão cobre os três.
- Migração `0054_terms_acceptance`: as duas colunas nulas e o `CHECK users_terms_acceptance_pair` (as duas juntas ou nenhuma).
- Sem aceite registrado: as contas do seed (admin, Bia, Caio) e os convites aceitos antes da `0054`.
- **Mudou o texto** de `site/src/content/legal/{termos,privacidade,uso}.md`: atualize o `updatedAt` e o `LEGAL_DOCUMENTS_VERSION` (`packages/contracts/src/legal/legal-documents.dto.ts`) juntos. As contas novas passam a gravar a versão nova; as antigas guardam a delas (pedir de novo seria uma tela própria, fora do escopo).
- No checkout dos planos, o recibo só diz que continuar aceita os Termos, sem gravar ([`billing.md`](billing.md)).

## Client

- `src/lib/legal-documents.ts` — `LEGAL_DOCUMENT_TITLES` ("Termos de uso", "Política de privacidade", "Política de uso") e `legalDocumentHref(document)` → `/api/legal/<documento>`.
- `src/components/legal-document-link.tsx` — `LegalDocumentLink`: `target="_blank"`, `rel="noopener noreferrer"`, o título como texto quando não há children; as outras props chegam ao `<a>` (o `asChild` do item do menu).
- `src/lib/source-code.ts` — `SOURCE_CODE_URL` (o repositório público). **Por que existe:** o app é AGPL-3.0, e o §13 pede que um serviço pela rede ofereça o código a quem o usa; o link é essa oferta. `src/components/source-code-link.tsx` — `SourceCodeLink` ("Código-fonte", nova aba, mesmas regras do `LegalDocumentLink`; no desktop, outro `https` cai no `OpenExternal`).
- Onde aparece: a caixa do `/invite` e do `/sign-up/confirm` ("Tenho 18 anos ou mais e li e aceito os Termos de uso, a Política de privacidade e a Política de uso", [`client/account-links.md`](client/account-links.md)), o rodapé do `AuthFrame` (`LegalLinks`: os três textos e o "Código-fonte", [`auth.md`](auth.md), Client) e o menu do usuário (só os três textos, pelo `legalDocumentDto.options`; o "Código-fonte" saiu dele em 2026-11-19, a pedido do responsável, [`client/home.md`](client/home.md)).

## Testes

- Unit: `server/test/modules/legal/legal.mapper.spec.ts`, `server/test/config/env.spec.ts` (`SITE_PUBLIC_URL`), `server/test/modules/account-links/{account-links.mapper,invitations.service}.spec.ts` (o aceite gravado) e `packages/contracts/test/account-links/account-links.dto.spec.ts` (`acceptedTerms` ausente ou `false` recusado).
- Integração: `server/test/integration/legal.spec.ts` (302 dos três sem sessão, 404 de outro, inclusive `usage`) e `account-links.spec.ts` (o aceite grava data e versão; sem ele, 400 sem conta e o convite segue valendo).
- Client: `test/lib/legal-documents.spec.ts`, `test/components/legal-document-link.spec.tsx`, `test/features/auth/auth-frame.spec.tsx`, `test/app/shell/user-menu.spec.tsx` e `test/features/account-links/invite-accept-page.spec.tsx` (links da caixa, abrir um texto não marca a caixa, caixa desmarcada não envia e recebe o foco, o pedido leva `acceptedTerms: true`). E2E: `e2e/test/backoffice.spec.ts` marca a caixa antes de "Criar minha conta".

## Armadilhas

- **Link dentro do `<label>` com `userEvent.click`:** o comportamento de clique do `user-event` manda qualquer clique dentro de um `<label>` ao controle dele, até num link, e a caixa sai marcada; o navegador (e o jsdom) não fazem isso com conteúdo interativo do label. Para provar que abrir um texto não marca a caixa, o spec usa `fireEvent.click` no link.
