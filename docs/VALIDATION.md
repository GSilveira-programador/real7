# Evidências locais

Validação executada nesta máquina em 29/10/2026. Não representa homologação de contas externas nem deploy em hospedagem comercial.

| Verificação                           | Resultado                                                               |
| ------------------------------------- | ----------------------------------------------------------------------- |
| TypeScript                            | `npm run typecheck` passou                                              |
| Regras e integração PostgreSQL        | 73 testes passaram em 12 arquivos                                       |
| Playwright desktop e celular          | 36 testes passaram                                                      |
| Build de produção                     | `npm run build` passou                                                  |
| Smoke do build compilado              | Home, catálogo e produto carregaram no Chromium, sem `pageerror`        |
| Cabeçalhos de produção                | CSP, HSTS, nosniff e proteção de framing presentes no upstream local    |
| Auditoria de dependências de produção | `npm audit --omit=dev --audit-level=low`: 0 vulnerabilidades reportadas |
| Migrations e seed repetidos           | Sem reaplicação de SQL e sem sobrescrever configurações/produtos        |
| Backup e restauração                  | pg_dump custom e pg_restore em banco temporário separado passaram       |
| Formatação e diff                     | Prettier e `git diff --check` passaram                                  |

Cobertura inclui senha, variações duplicadas, preços adulterados, cupons, indisponibilidade, duas transações disputando a última unidade, estoque negativo, liberação única de reserva, MFA criptografado, assinatura de webhook, eventos de pagamento duplicados, divergência de valor, reserva/idempotência de checkout, timeout de preferência e preservação do acesso visitante. E2E cobre cadastro/login, persistência de carrinho, navegação/filtros, bloqueio de compra fictícia, CSRF, MFA administrativo, permissões de atendente, cadastro de produto, ajuste de estoque e exportação Excel/CSV.

Respostas de gateway e cotação no teste de checkout são isoladas via mocks em `tests/`; a aplicação não oferece gateway simulado. SMTP, upload S3 e frete real não foram exercitados com contas externas. O smoke de produção usou o upstream HTTP local com APP_URL HTTPS configurada; a terminação TLS pública ainda precisa ser testada na hospedagem.

A restauração final conferiu 6 produtos, 54 variações e 7 migrations; o histórico completo fica em `_elite_migrations`. O backup final está em `/workspace/backups/elite-validation.dump`, com SHA-256 ao lado. Uma restauração local não equivale a backups automáticos/offsite configurados.

A etapa de gestão comercial também foi validada: publicação apenas dentro do agendamento, pausa por campanha, rejeição de links externos nos banners, conflitos de versão em produtos/banners, ordenação de galeria, arquivamento de variações e relatórios com 202 pedidos no mesmo dia de Brasília, incluindo limites de meia-noite. E2E adicional cobre carrossel em celular, edição de campanha/galeria no painel, relatório, recuperação de carrinho e foco/teclado de zoom e guia.

A etapa de identidade valida confirmação de newsletter com token de uso único, expiração, descadastro idempotente, recuperação de preferências e consentimento renovado. A administração é testada com MFA, revogação de sessões, rejeição de perfis não autorizados/contas não verificadas, versões obsoletas, recuperação operacional com confirmação e proteção do último administrador sob concorrência. Também são testados 20 acessos simultâneos a uma janela de rate limit (5 permitidos, 15 bloqueados), assinaturas Unicode malformadas e tokens tardios de contas anonimizadas. Os 32 testes E2E abrangem desktop/celular; os links de e-mail são lidos da outbox de teste, sem afirmar envio SMTP real.

Foram acrescentadas regressões de concorrência do carrinho: GET anônimo não cria cookie, a inicialização evita leituras duplicadas, uma cotação atrasada não substitui a mais recente e falhas de carregamento bloqueiam gravações até uma recuperação explícita. O botão de compra aguarda os valores válidos. Também há testes que impedem emissão de sessão com snapshot de senha/MFA/perfil já alterado e comprovam revogação durante um reset concorrente.

A manutenção temporária acrescentou quatro testes: validação de lote, prévia sem alterações, preservação de e-mails pendentes/dados comerciais, repetição idempotente, limite por tabela, carrinho bloqueado e recusa de execução concorrente. O teste de concorrência identificou uma reavaliação do subselect de DELETE pelo PostgreSQL; a seleção foi isolada em CTE MATERIALIZED para garantir o tamanho máximo do lote. A sétima migration adiciona índices temporais. Build e suíte de 44 testes reexecutados após a correção; os 32 E2E permanecem da última validação da interface, que não foi alterada nesta etapa.

Etapa financeira: testes de dez webhooks simultâneos, eventos atrasados, regressão de estado, reembolso terminal, conflito de transações, aprovação tardia repetida sem alterar estoque e respostas inválidas. A conciliação é testada com 51 pagamentos em duas páginas, consulta vazia, divergência de referência, resposta parcial e falha de confirmação. Nenhuma operação financeira externa foi executada.

Etapa de devoluções: nove testes de integração verificam concorrência de solicitações/operadores, transições, versão obsoleta, decisão registrada, reembolso integral, estoque preservado, timeout, consulta idempotente e divergências do provedor. O fluxo do navegador testa solicitação visitante, decisão/observação na área administrativa e visualização pelo cliente em desktop/celular; nenhuma requisição financeira real é feita. Os testes antigos de cupom e edição administrativa foram corrigidos para distinguir múltiplos status acessíveis e dispensar o consentimento antes de interagir com conteúdo coberto.

Gestão de pedidos: sete testes adicionais cobrem paginação de 201 pedidos empatados por data, recuperação do pedido antigo, filtros de situação/rastreio/e-mail, limites de datas em Brasília, erros e projeção de campos privados. Navegador testa atendente autenticado, acesso anônimo bloqueado, paginação, detalhe e atualização logística auditada.
