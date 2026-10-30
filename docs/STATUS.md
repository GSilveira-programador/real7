# Estado da entrega

## Implementado e validável localmente

- Loja responsiva com catálogo real no PostgreSQL, filtros combináveis, paginação e ordenação por preço, data, vendas aprovadas e avaliações aprovadas.
- Produto com galeria, zoom, guia ilustrativo, tamanhos, quantidade, favoritos, consulta de frete preparada e formulário de avaliação restrito a compras entregues.
- Carrinho persistido no banco por cookie HttpOnly; cálculo de preços/cupom no servidor; checkout visitante/conta com reserva transacional e idempotência.
- Autenticação bcrypt, sessões revogáveis, verificação/reset por token de uso único e outbox SMTP; MFA TOTP para administração com segredo criptografado e prova MFA vinculada à sessão. Sessões antigas sem essa prova não acessam a administração.
- Alteração de perfis pela interface com código MFA, motivo auditado, versão de permissões e revogação de sessões. Último administrador protegido inclusive contra despromoções simultâneas. Recuperação de MFA apenas por comando operacional no servidor.
- Conta, endereços, favoritos, histórico, pedido/rastreio, exportação LGPD, anonimização e solicitação de devolução. Devoluções têm decisões versionadas com observação ao cliente, tentativa exclusiva de reembolso integral e consulta de respostas incertas, sem reposição automática de estoque.
- Painel com permissões, catálogo/estoque por tamanho, marcas/categorias, cupons, clientes, logística, moderação, devoluções, auditoria, configuração comercial e banner.
- Campanhas e banners agendados, pausa por campanha, carrossel manual acessível e trilha de auditoria. Edição de atributos, galeria ordenada, cadastro/arquivamento de variações e controle de versões contra sobrescrita concorrente.
- Relatórios agregados no servidor por período, em dias de Brasília, sem corte de 200 pedidos; totais, faturamento diário, situações e produtos vendidos.
- Carrinho recuperável quando um produto/tamanho é arquivado ou perde estoque. Leitura anônima não cria cookie; inicialização e gravações são protegidas contra corridas, respostas de cotação antigas são descartadas e falhas de carregamento exigem recuperação antes de sobrescrever dados.
- Exportação CSV e Excel. Upload S3 com checagem básica de formato/tamanho e autorização de gerente/admin.
- Integração de checkout hospedado Mercado Pago, webhook HMAC, consulta de confirmação, deduplicação sob concorrência, proteção contra eventos fora de ordem e reembolso integral preparado. Aprovação após cancelamento segue para análise sem alterar estoque. Conciliação paginada detecta resultados incompletos. Nenhuma aprovação de pagamento pelo navegador.
- Integração de cotação Melhor Envio com dados de embalagem e regra de frete grátis. SMTP e imagens S3 configuráveis.
- Contato persistido, newsletter com confirmação de e-mail, consentimento versionado, recuperação de link de preferências e descadastro sem login. Inscrições só são ativadas após confirmação e e-mails pendentes da newsletter são removidos ao cancelar. WhatsApp oculto sem número comercial e minutas legais claramente identificadas.
- Exclusão de conta revoga tokens de recuperação, remove newsletter e bloqueia sessões de cadastros anonimizados, preservando pedidos por obrigação operacional/legal. Limites de tentativas são atômicos no PostgreSQL. A criação de sessão revalida os dados de acesso sob lock para não aceitar credenciais substituídas durante um login em andamento.
- Manutenção por CLI com prévia, lotes limitados, trava concorrente, auditoria e preservação de dados comerciais. Limpa sessões/tokens expirados, limites antigos, carrinhos inativos e e-mails enviados; agendamento externo documentado.
- Migrations SQL, constraints, scripts de backup/restauração, CI e documentação.

## Dependências externas para homologação

- Credenciais e contas de teste/produção de Mercado Pago e Melhor Envio, SMTP/TCP e S3/CDN.
- Testes financeiros fim a fim no ambiente do provedor; testes de envio SMTP, upload real e cotação real com dados da operação. Os testes automatizados usam respostas isoladas de teste onde não há credenciais.
- Dados da empresa, CNPJ, domínio/HTTPS, atendimento, catálogo real, estoque físico, logística fiscal e revisão jurídica.
- Hospedagem escolhida, CD, monitoramento/alertas e backups externos agendados.

## Pendências que não devem ser confundidas com módulos prontos para escala comercial

- Cancelamento automatizado de preferências e liberação segura de reservas vencidas/ambíguas; resolução operacional de preferências ambíguas. O visitante já preserva acesso privado ao pedido e a preferência não é recriada automaticamente.
- Etiquetas, contratação de coleta e atualização automática de tracking pela transportadora.
- Regras promocionais avançadas com empilhamento de descontos e segmentação. Campanhas atuais organizam banners e podem referenciar cupons; não alteram preços automaticamente.
- Funil/conversão com consentimento e integração de analytics. Relatórios de pedidos e vendas por período já estão implementados.
- Aprovação jurídica de retenção de dados comerciais/consentimentos, agendamento e alertas da limpeza temporária; integração da recuperação operacional de MFA ao processo de autorização/identificação da equipe.
- Reembolso parcial/contestação, emissão fiscal/ERP e antifraude adicional.
- WhatsApp Business API oficial e disparos de campanhas de marketing. A newsletter já tem confirmação/descadastro e notificações transacionais, mas não há envio promocional em lote.
- Teste independente de segurança, mídia reencodificada, revisão manual de acessibilidade e testes de carga.

As funções dependentes de credenciais falham de forma explícita quando não configuradas. Modo demonstração não simula vendas, depoimentos ou entregas reais. Esta entrega é uma aplicação funcional para desenvolvimento/homologação, **não uma certificação de prontidão comercial nem conclusão integral de todos os requisitos avançados**.
