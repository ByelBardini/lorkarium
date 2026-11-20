# Contribuindo com o Lorkarium

Obrigado pelo interesse! O Lorkarium é open source: issues, sugestões e pull requests são bem-vindos.

## Antes de começar

- Como subir o projeto (pré-requisitos, `pnpm dev`, banco, desktop): a seção [Desenvolvimento](README.md#desenvolvimento) do README.
- Stack, layout do repositório e camadas do server: [AGENTS.md](AGENTS.md).
- Estilo de código, testes e regras de trabalho, para gente e para agente de IA: [CLAUDE.md](CLAUDE.md).
- O detalhe de cada área (contratos, eventos, tabelas, armadilhas): [docs/context/](docs/context/). Leia o arquivo da área antes de mexer no código dela e atualize-o junto com a mudança.
- Mudança grande ou que mexe no produto? Abra uma issue de sugestão antes, para combinarmos o caminho.

## Pull requests

1. Crie uma branch a partir da `main`.
2. Escreva o teste antes ou junto com o código (specs em `<workspace>/test/`, espelhando `src/`).
3. Antes de abrir o PR, rode:

   ```sh
   pnpm test && pnpm lint && pnpm typecheck
   ```

4. Commits no padrão convencional, em português: `feat(client): …`, `fix(server): …`, `docs(context): …`.
5. Preencha o modelo do PR: o que muda, como testar e os docs atualizados.

## Licença das contribuições e DCO

A contribuição entra sob a licença da pasta que ela altera, a mesma em que você a recebeu: **AGPL-3.0-only** no repositório e **MIT** em `packages/game-core/` e `packages/dice-renderer/` (veja o [NOTICE.md](NOTICE.md)).

Assine cada commit com o [Developer Certificate of Origin 1.1](https://developercertificate.org/), declarando que você tem o direito de enviar aquele código sob essa licença:

```sh
git commit -s -m "feat(client): …"
```

O `-s` acrescenta a linha `Signed-off-by: Seu Nome <seu@email>` ao commit. Nenhum robô bloqueia o PR por isso, mas pedimos que todo commit a tenha.

## O que não aceitamos

- Mudanças no nome, no logo ou na marca do Lorkarium, que não fazem parte da licença.
- Novos memes, sons ou imagens de terceiros sem licença clara (os que já existem estão listados no [NOTICE.md](NOTICE.md)).
- Código que contorne os limites dos planos, as permissões das mesas ou a autoridade do servidor.

## Falhas de segurança

Não abra issue pública: siga a [política de segurança](SECURITY.md).

## Conduta

Quem participa segue o [Código de Conduta](CODE_OF_CONDUCT.md).
