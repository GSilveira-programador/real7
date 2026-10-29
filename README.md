# JN Chuteiras

> **Esta página é a documentação do projeto, não a loja em execução.** O código da aplicação está em [`src/`](src). Para abrir a vitrine, é necessário executar a aplicação com PostgreSQL ou publicá-la em uma hospedagem compatível com Next.js. GitHub Pages não executa este backend.

E-commerce de chuteiras com Next.js 16, React 19, TypeScript, Tailwind 4, PostgreSQL 17 e Prisma 7. Interface em português, responsiva, tema claro/escuro, ilustrações SVG originais e seis produtos **inteiramente fictícios**. O código substitui o site Real7; uma cópia do site original foi preservada fora do checkout em `/workspace/backups/real7-original.tar.gz` nesta máquina e o histórico Git original foi mantido.

## Abrir a aplicação pelo navegador

[**Abrir JN Chuteiras no GitHub Codespaces**](https://codespaces.new/GSilveira-programador/real7?ref=main). Crie o ambiente, aguarde a instalação e abra a porta **3000** na aba **Ports**. Inclui servidor e banco demonstrativo. Veja [o passo a passo](docs/CODESPACES.md).

## Aparência da loja

[Prévia visual no GitHub Pages](https://gsilveira-programador.github.io/real7/) — requer Pages ativado na branch `gh-pages`, pasta `/ (root)`. É uma captura rolável, sem compras ou botões interativos.

Captura da aplicação executada localmente, com catálogo fictício e vendas desativadas. Esta imagem não é um link de acesso à loja.

![Vitrine JN Chuteiras em ambiente demonstrativo](docs/images/vitrine-desktop.png)

## Estado e limites

A aplicação funciona localmente com banco real. O checkout **não aceita vendas** enquanto `DEMO_MODE=true` ou a operação não estiver configurada. Não há credenciais padrão nem administrador público. Integrações Mercado Pago, Melhor Envio, SMTP e S3 estão implementadas, mas precisam de credenciais e homologação nas respectivas contas. Não foi realizada cobrança real.

Leia [estado de implementação e critérios de lançamento](docs/STATUS.md) antes de usar comercialmente. Uma compilação ou teste local aprovado não certifica segurança de produção, acessibilidade completa ou conformidade jurídica.

## Instalação

Requisitos: Node.js 24 LTS, npm, PostgreSQL 17 (local, Docker ou gerenciado). Chromium para E2E.

```bash
npm ci
cp .env.example .env # somente se .env ainda não existir
# Edite DATABASE_URL e APP_URL. Gere MFA_ENCRYPTION_KEY com:
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
# A saída é um segredo; salve apenas no gerenciador de segredos/.env privado.
# Para PostgreSQL local, configure POSTGRES_PASSWORD e execute:
docker compose up -d db
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

Abra a aplicação na porta 3000 pelo mecanismo de acesso da sua hospedagem. Na nuvem de onboarding, use requisições locais para validação, sem publicar links de loopback. Cada tarefa já está isolada: use o checkout existente, sem criar worktrees sem solicitação.

`db:seed` é idempotente e não sobrescreve alterações de produtos ou configurações existentes. O cupom `ELITE10` é fictício e serve para testar o cálculo de 10% a partir de R$ 200. Dados de testes e seed nunca devem ser apresentados como vendas ou depoimentos reais.

### Atalho nesta nuvem

`npm run setup:cloud` verifica/reinicia apenas o container local `elite-postgres`, reaproveita `.env` existente e só cria credenciais aleatórias quando o arquivo não existe. Ele recusa bancos externos e nunca remove volumes. Em uma máquina nova, execute depois geração, migrations e seed. Para bancos de produção, use a instalação explícita acima.

### Banco e migrations sem binários nativos

`npm run db:generate` utiliza os geradores **oficiais** Prisma JavaScript/WASM, com versões travadas pelo lockfile. `scripts/generate.ts` usa APIs internas dos pacotes oficiais; mantenha as versões de gerador, ORM e internals iguais e teste qualquer atualização. Não baixa engines nem desabilita verificações de integridade/TLS.

`npm run db:migrate` aplica o SQL revisado em `prisma/migrations` por `pg`, usando transações, lock consultivo PostgreSQL, histórico `_elite_migrations` e SHA-256. Reexecutar não reaplica migrations. Migrations aplicadas não podem ser editadas. **Não misture este histórico com `prisma migrate deploy/dev`**, que usa outra tabela. Para evoluir o schema, crie uma nova migration SQL revisada e valide em banco separado. O schema Prisma é a fonte dos tipos e relacionamentos; constraints financeiras extras ficam no SQL.

### Administrador

Defina `ADMIN_EMAIL` e `ADMIN_PASSWORD` pelo ambiente seguro e execute `npm run admin:create`. A senha deve ter pelo menos 12 caracteres e no máximo 72 bytes UTF-8. Nenhum segredo é impresso pelo comando. Entre em `/conta`, configure um autenticador TOTP e confirme o código. O segredo MFA é criptografado com AES-256-GCM; **faça backup seguro de MFA_ENCRYPTION_KEY**. Após ativar, entre novamente com senha e TOTP. O painel está em `/admin` e valida permissões no servidor.

Perfis: `ADMIN` configura a operação; `MANAGER` gerencia catálogo, estoque, cupons, moderação e devoluções; `AGENT` consulta o painel e atualiza logística; `CUSTOMER` acessa apenas os próprios dados. Alterações de perfil são feitas pelo administrador na área Clientes, com código MFA, motivo e auditoria; sessões são revogadas e o último administrador é protegido. Recuperação de MFA existe apenas por comando operacional no servidor, após identificação e autorização independente. Veja [identidade e newsletter](docs/IDENTITY_AND_NEWSLETTER.md).

## Comandos e validação

```bash
npm run typecheck
npm test                 # PostgreSQL real, regras e integrações com provedores isolados em testes
npm run test:e2e         # npm run dev já iniciado; Chromium disponível
npm audit --omit=dev
npm run build
npm start                # produção exige APP_URL HTTPS e proxy TLS
npm run worker:mail      # executar periodicamente com SMTP configurado
npm run payments:reconcile
# Recuperação operacional, somente após configurar as variáveis RECOVERY_* de forma segura:
# npm run admin:recover-mfa
```

E2E padrão usa `/usr/bin/chromium`; configure `CHROMIUM_PATH` para outro executável. Não execute testes no banco comercial: eles criam fixtures e contas temporárias. Testes de pagamento usam mocks **somente em testes**, sem endpoints de "pagamento simulado" na aplicação.

## Organização

```text
src/app/                 Rotas, metadata, CSP, estilos e API
src/components/          Loja, conta, carrinho, checkout e painel
src/lib/                 Banco, segurança, pagamentos, frete, validação, criptografia e S3
prisma/schema.prisma     Modelo relacional
prisma/migrations/       SQL versionado e constraints
scripts/                 Geração, migrations, administrador, e-mail, conciliação e backups
public/images/           Ilustrações próprias identificadas como conceituais
tests/                   Testes unitários, integração PostgreSQL e E2E
.github/workflows/       CI com PostgreSQL, auditoria, build e E2E
```

[Arquitetura](docs/ARCHITECTURE.md) · [APIs e integrações](docs/API.md) · [Pagamentos/frete/e-mail/imagens](docs/INTEGRATIONS.md) · [Produção e segurança](docs/PRODUCTION.md) · [Status e pendências](docs/STATUS.md)

Manutenção de dados temporários: `npm run maintenance` mostra a prévia; veja [a política e o agendamento](docs/MAINTENANCE.md) antes de usar `--apply`.
