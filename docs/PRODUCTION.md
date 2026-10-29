# Publicação e operação

## Preparação

Use staging isolado e banco gerenciado PostgreSQL 17 com TLS, backups e ponto de restauração. Node.js 24, npm e execução persistente de Next.js são necessários; não hospede esta aplicação como site estático. O usuário do banco em produção não deve ser superusuário. Separe credenciais de migrations (DDL) e aplicação (somente operações necessárias).

1. Configure segredos, `DATABASE_URL`, `APP_URL=https://seu-dominio`, `MFA_ENCRYPTION_KEY` e integrações. Não copie `.env` de desenvolvimento para produção.
2. `npm ci && npm run db:generate && npm run db:migrate && npm run build`.
3. `npm start` atrás de proxy HTTPS confiável. O código recusa produção sem APP_URL HTTPS. Verifique que a terminação TLS e o domínio público correspondem à origem configurada; não permita que clientes forjem headers do proxy.
4. Crie administrador pelo comando seguro, ative MFA e teste os três perfis operacionais. Não há usuário/senha padrão.
5. Configure SMTP com DNS de envio. Supervisione `worker:mail` a cada minuto e `payments:reconcile` a cada cinco minutos. Inicialmente, use uma única instância de cada job; o worker SMTP inclui lock.
6. Substitua o catálogo fictício por produtos reais, medidas verificadas, imagens autorizadas, SKU/estoque físico e especificações oficiais. Arquive os produtos `demo=true`; eles nunca são vendáveis.
7. Configure empresa, CNPJ, endereço, atendimento, banner, regra de frete e termos revisados. Defina `MP_COLLECTOR_ID` e confira a conta recebedora.
8. Homologue provedor com credenciais de teste em staging. Depois configure produção, `DEMO_MODE=false`, e ative vendas no painel. Não ative vendas apenas para ocultar avisos de demonstração.

A publicação na nuvem do onboarding cria um snapshot de desenvolvimento; **não é deploy comercial**. O CI fornecido executa validação e gera build, mas não envia a nenhuma hospedagem. O job de CD depende da escolha de hospedagem e suas credenciais.

## HTTPS e cabeçalhos

HSTS em produção, CSP com nonce por requisição, frame-ancestors none, nosniff, Referrer-Policy strict-origin-when-cross-origin e permissões restritas. Secure/HttpOnly/SameSite nos cookies de sessão. Teste o domínio real com sua CDN/proxy; proteja também assets e páginas de erro. A CSP permite estilos inline para compatibilidade do layout; hardening adicional deve ser homologado.

`MP_COLLECTOR_ID` impede aceitar pagamentos de outra conta. Configure allowlist de imagens/CDN mais restrita em CSP quando os destinos reais forem conhecidos. Não inclua scripts de marketing sem consentimento específico. Analise headers de cache para não armazenar respostas de conta/API no CDN.

## Segurança antes de lançamento

- [ ] Homologação real de pagamento e frete, incluindo eventos duplicados/atrasados, cancelamentos, timeouts e reembolsos.
- [ ] Procedimento de recuperação operacional de MFA homologado com identificação do solicitante, operador e autorização fora da aplicação. O comando já está implementado; chave de criptografia guardada separadamente e rotação planejada.
- [ ] Controles de acesso por perfil revisados; monitorar auditoria e alterações de estoque.
- [ ] Proteção de borda contra abuso/DoS e limites de upload. Código tem limites compartilhados por rota/conta, mas não substitui WAF/limite por IP do proxy confiável.
- [ ] Pipeline de imagem com reencoding, limite de pixels e análise de conteúdo. A aplicação confere apenas tamanho e assinatura básica do arquivo.
- [ ] Teste independente de segurança e revisão OWASP, incluindo autorizações/IDOR, sessão, XSS, CSRF, SSRF e recuperação de conta.
- [ ] Auditoria de dependências, renovação de certificados e atualização regular testada. O lockfile deve ser instalado com npm ci.
- [ ] Revisão manual WCAG 2.2 AA, leitores de tela, zoom 200%, contraste em ambos os temas e navegação por teclado. Testes locais não certificam conformidade.
- [ ] CNPJ/identidade, políticas legais, prazos e canal LGPD aprovados pelo responsável jurídico.
- [ ] Logs sem senhas, tokens, corpo de webhook com PII ou query `access`. Ocultar query strings de URLs de pedido/reset no proxy e ferramentas de monitoramento.
- [ ] Rate limits, sessão e expiração de carrinhos/tokens com política de limpeza. Validar `npm run maintenance` e agendar a execução aplicada conforme [MAINTENANCE.md](MAINTENANCE.md), com alertas.
- [ ] Captura de alertas de erro, filas atrasadas, falhas de conciliação, reservas vencidas e falhas de backup na ferramenta de monitoramento escolhida.

A aplicação registra erros por classe sem despejar segredos e tem auditoria no banco; armazenamento centralizado, alertas e resposta a incidentes precisam ser configurados na hospedagem. Avalie criptografia de PII, minimização e prazos legais de retenção.

## Backups e restauração

`scripts/backup.sh` usa pg_dump custom, permissões privadas e SHA-256. Injete DATABASE_URL por segredo e defina BACKUP_DIR. Agende diariamente, replique criptografado fora da máquina, restrinja acesso e defina retenção aprovada. PostgreSQL gerenciado com PITR é recomendado.

Restaure periodicamente em banco **vazio e diferente do original**, usando `RESTORE_DATABASE_URL` e `scripts/restore-check.sh caminho.dump`. O script verifica checksum, impede origem=destino, recusa banco com tabelas e usa pg_restore --exit-on-error. Depois compare contagens/constraints e execute smoke tests nessa cópia. Nunca restaure sobre produção para "testar" backup.

Nesta máquina foi executado pg_dump/pg_restore em banco temporário separado, verificando 6 produtos, 54 variações e 6 migrations. Isso valida uma restauração local pontual; não prova que backups automáticos, offsite, PITR ou recuperação da infraestrutura estejam configurados.

## Limitações operacionais importantes

- Reservas com criação de preferência ambígua não são liberadas automaticamente. O acesso do visitante é preservado por token criptografado e outbox transacional; libere estoque somente após expiração/cancelamento confirmado no provedor.
- Reembolso integral requer confirmação da API. Reembolsos parciais, disputas complexas, documentos fiscais, ERP, antifraude adicional e etiquetas não estão automatizados.
- Venda de mais de um volume exige conferir as regras de empacotamento retornadas pelo frete. As medidas cadastradas são por unidade embalada.
- A visão geral do painel usa os últimos 200 pedidos. A aba Relatórios agrega todos os pedidos criados no período selecionado, em dias de Brasília, até 366 dias por consulta. CSV/XLSX exportam o histórico completo. Faturamento aprovado exclui pedidos cancelados ou em devolução; valor dos itens mais vendidos é anterior ao rateio de cupom/frete. Não é um relatório fiscal/contábil nem uma medição de conversão.
- Não há emissão de NF-e/NFC-e; defina faturamento fiscal antes de operação comercial quando exigido.

## Atualização de identidade e consentimento

A sexta migration adiciona prova MFA às sessões. Sessões administrativas criadas antes dela precisam ser encerradas e recriadas por login com senha e TOTP. Sessões normais de clientes continuam válidas, salvo revogação/exclusão. A mudança de perfil exige código MFA recente, motivo e versão esperada; encerra as sessões do usuário afetado. O último administrador verificado com MFA não pode ser removido, mesmo em requisições concorrentes.

`MFA_ENCRYPTION_KEY` também protege os tokens privados de recuperação do checkout visitante e de descadastro da newsletter. Não troque essa chave sem planejar migração/recuperação dos ciphertexts. Perder a chave pode exigir reenrolamento de MFA e reemissão controlada de links; restaurar apenas o banco não recupera a chave.

Newsletter exige confirmação do endereço; a migration não considera inscrições antigas automaticamente autorizadas. Não inicie disparos promocionais sem consentimento confirmado e mecanismo de descadastro. O fluxo implementado envia apenas confirmação, boas-vindas e preferências via outbox SMTP. A visita GET aos links não altera inscrições. Confira registros de consentimento e de cancelamento conforme a política revisada, sem reativar cancelamentos por importação de planilhas.

As páginas de conta, pedido, checkout, favoritos, administração e preferências usam noindex e Referrer-Policy no-referrer. APIs e páginas sensíveis recebem Cache-Control privado/no-store. Revalide esses cabeçalhos na CDN/proxy real. Limites por família de rota e conta são atômicos no PostgreSQL e não substituem o WAF por IP confiável na borda.
