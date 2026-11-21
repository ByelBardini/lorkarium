# Deploy: Sentry (captura de erros)

Hub: [`../deploy.md`](../deploy.md). O que o código faz com os erros: [`../error-reports.md`](../error-reports.md).

Nesta ordem; cada passo só depois do anterior conferido. Sem `SENTRY_DSN` nada sai do app (o client nem carrega o SDK), então dá para fazer o deploy do código antes de ligar.

1. **Organização nova** no Sentry com _Data Storage Location_ = **EU** (Frankfurt). Não se troca depois: errar aqui é refazer a organização. Um projeto só, plataforma JavaScript; a tag `runtime` (`server`, `browser`, `desktop`) separa as origens.
2. **No projeto**:
   - _Security & Privacy_: _Prevent Storing of IP Addresses_ ligado; _Data Scrubber_ e _Use Default Scrubbers_ ligados.
   - _Inbound Filters_: extensões de navegador, localhost, navegadores antigos e web crawlers ligados.
   - _Enable JavaScript source fetching_ ligado: o Sentry baixa os `.map` públicos do client para resolver a pilha (o build não leva token).
   - _Spike protection_ ligado (na organização).
   - _Alerts_: "issue nova → e-mail" para o responsável.
   - _Legal & Compliance_: o DPA do Sentry aceito.
   - Anotar o prazo de retenção do plano: a Privacidade diz 30 dias (plano Developer); outro prazo pede revisão do texto.
3. **Landing** com a Privacidade nova no ar (seção Landing de [`../deploy.md`](../deploy.md)): ela precisa contar o Sentry antes de o DSN entrar.
4. **Coolify**, na Application do server, como variáveis de _runtime_ ([`envs.md`](envs.md)): `SENTRY_DSN` (o DSN do projeto, _Client Keys_), `SENTRY_ENVIRONMENT=production` e `SENTRY_RELEASE` com o commit do deploy (a variável predefinida `SOURCE_COMMIT` do Coolify, a conferir no painel: sem ela, deixar vazio). _Restart_.
5. **Conferência**: Backoffice → "Teste de erros" → os dois botões. No Sentry, duas issues:
   - a do server (`ErrorReportTestError`), com quadros em `src/modules/error-reports/…ts` (o `--enable-source-maps` da imagem), `user.id` e `user.username` do admin, sem IP, tag `runtime: server`;
   - a do client (`ClientErrorTest`), com a pilha original (source map resolvido), `runtime` = `browser` ou `desktop`, id e @ do admin, sem IP.
     O mesmo erro do server vira um relato só por minuto: o segundo clique logo em seguida não abre nada novo.
6. **Desligar**: apagar o `SENTRY_DSN` e _Restart_. O client para de carregar o SDK na próxima página; o túnel responde 204.

## Armadilhas

- `SENTRY_ENVIRONMENT` ou `SENTRY_RELEASE` sem o `SENTRY_DSN` recusam o boot (um DSN esquecido não passa calado); `http://` no DSN só fora da produção.
- Sentry fora do ar não derruba nada: o relato do server que falha vira `warn` e o do navegador é respondido 200 com o repasse em `warn` (nunca `error`, que geraria relato sobre o próprio relato).
