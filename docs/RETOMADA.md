# Retomada — JN Chuteiras

O projeto está salvo em `/workspace/real7`, substituindo o site estático anterior. O envio do código ao GitHub foi autorizado pelo usuário. Confira o commit e a branch em `git status`, `git log` e no remoto antes de retomar; o envio não publica a loja em um domínio.

## Estado validado

- Next.js, React, TypeScript, PostgreSQL e Prisma funcionando localmente.
- 73 testes unitários/integração e 36 testes desktop/celular aprovados.
- Build de produção e smoke test aprovados; auditoria de dependências de produção sem vulnerabilidades reportadas na última execução.
- Backup PostgreSQL restaurado com 6 produtos, 54 variações e 7 migrations.
- Nova etapa: banners e campanhas agendados, edição completa de atributos/galeria, variações arquiváveis, relatórios por período e recuperação de carrinho indisponível.
- Nova etapa de identidade: newsletter com confirmação/descadastro; gestão de perfis com MFA e auditoria; recuperação operacional de MFA por CLI; prova MFA por sessão e limite de tentativas atômico.
- Nova etapa operacional: limpeza de temporários por CLI, com prévia/lotes/auditoria e testes de concorrência; veja MAINTENANCE.md. Agendamento externo ainda pendente.
- Loja demonstrativa: produtos fictícios e vendas reais bloqueadas.
- Integrações externas exigem credenciais e homologação. Consulte STATUS.md, INTEGRATIONS.md e PRODUCTION.md.

## Ao continuar

1. Leia README.md e docs/STATUS.md; confira git status e preserve as alterações existentes.
2. Execute npm run setup:cloud para conferir PostgreSQL local. Não remova volumes nem sobrescreva .env.
3. Inicie npm run dev; a porta é 3000. Processos podem precisar ser reiniciados.
4. Escolha como levar o código para o computador: clonagem do repositório no GitHub ou transferência do código. A sessão da nuvem não sincroniza automaticamente com VS Code local.
5. No computador, configure PostgreSQL e .env conforme README, instale dependências, gere o cliente, aplique migrations e execute npm run dev. O Next.js atualiza o navegador ao salvar alterações.

O rascunho do ambiente já tem instruções de instalação e inicialização atualizadas. Revisar, salvar e publicar o ambiente preserva sua preparação por snapshot; isso não publica o código no GitHub, não cria um site público e não conecta o VS Code automaticamente. A restauração em uma nova tarefa ainda não foi verificada.

Nunca envie .env, credenciais ou backups com dados pessoais para o GitHub. O backup de código abaixo exclui .env e não substitui o backup separado do banco ou a guarda segura da chave MFA.

## Sincronização autorizada

O usuário autorizou enviar o projeto e perguntou sobre os próximos salvamentos. Durante o trabalho nesta conversa, agrupar alterações em etapas coerentes, validar, criar commit e enviar ao GitHub, preservando segredos e dados locais. Não instalar hooks de push a cada arquivo nem afirmar sincronização em segundo plano. No VS Code local, usar Git Pull para receber commits; salvar um arquivo por si só não cria commit nem push.

Etapa financeira: oitava migration adiciona data de atualização do provedor. Webhooks concorrentes são serializados; regressões/eventos antigos e pagamentos conflitantes são auditados; aprovação tardia exige análise e não altera estoque. Conciliação paginada recusa resultados parciais. Administração inicial no Codespaces do usuário foi adiada a pedido dele; não criar senha pública nem desativar MFA.

Nova etapa: devoluções com lock por pedido, decisões versionadas, observação visível ao cliente, envio exclusivo de reembolso integral e consulta de tentativas incertas. Nona/décima migrations aplicadas localmente; detalhes em RETURNS.md. O servidor do Codespaces do usuário precisa atualizar código/cliente/migrations antes de refletir essa etapa.

Gestão de pedidos: busca/paginação no histórico completo, detalhe sob demanda, filtros em dias de Brasília, projeção sem segredos e auditoria logística transacional. Décima primeira migration de índices aplicada localmente. Ver ORDER_MANAGEMENT.md.
