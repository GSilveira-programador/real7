# Integrações e ativação

Não informe credenciais em chats nem no frontend. Use segredos da hospedagem. `.env` local é ignorado pelo Git. As variáveis em `.env.example` são nomes e exemplos sem chaves reais.

## Mercado Pago

1. Crie a aplicação na conta do lojista e obtenha credenciais de **teste** para homologação.
2. Configure `MP_ACCESS_TOKEN` no servidor, `APP_URL` com a origem HTTPS exata e `MP_WEBHOOK_SECRET` da aplicação. Provedor: `https://api.mercadopago.com`.
3. Cadastre notificações HTTPS no endpoint `/api/webhooks/mercadopago` para eventos de pagamento. O identificador é recebido como `data.id`; os headers `x-signature` e `x-request-id` são obrigatórios.
4. O servidor monta o manifesto `id:<data.id>;request-id:<x-request-id>;ts:<timestamp>;`, verifica HMAC-SHA256 e validade de cinco minutos. Garanta relógio sincronizado e confirme o contrato atual na documentação do provedor antes de publicar.
5. Use contas de comprador/vendedor de teste e produtos **não marcados como fictícios** em um banco de staging. `DEMO_MODE=false` e `salesEnabled=true` só nesse staging configurado permitem o fluxo integral. Não use cartões ou dinheiro reais em staging.
6. Teste aprovado, pendente, rejeitado, cancelamento, duplicação, reembolso, notificações atrasadas, valor incorreto, indisponibilidade e recuperação. Confirme métodos e parcelamento habilitados pela conta. Débito não é prometido quando o provedor não o oferece.
7. Migre para credenciais de produção apenas após homologação. Confirme que o recebedor é o lojista correto; cadastre `MP_COLLECTOR_ID` para checagem adicional, conforme descrito no guia de produção.

O pagamento não é aprovado pelo retorno do navegador. A integração usa preferência/checkout hospedado. CPF e outros dados exigidos pelo meio de pagamento devem ser coletados pelo provedor; a loja não armazena PAN/CVV. Em timeout após reserva, consulte o pedido e concilie: não clique repetidamente criando novas chaves.

`npm run payments:reconcile` consulta pagamentos dos pedidos pendentes. Reservas vencidas são sinalizadas para revisão; não são liberadas automaticamente, pois um pagamento tardio poderia causar overselling. Complete o procedimento de cancelar/expirar preferências no provedor antes de liberar estoque. Reembolso integral é disparado pelo painel após aprovar a devolução e confirmar recebimento, com idempotência por solicitação; estoque exige inspeção física e ajuste auditado.

## Melhor Envio

- `SHIPPING_API_URL=https://sandbox.melhorenvio.com.br/api/v2` para testes; produção: `https://melhorenvio.com.br/api/v2`.
- `SHIPPING_TOKEN`: token da conta; `SHIPPING_ORIGIN_POSTCODE`: CEP de origem sem máscara.
- O servidor consulta `/me/shipment/calculate` com CEP de destino, quantidade, valor segurado e peso/dimensões cadastrados por produto. Confira **medidas da embalagem real**, restrições e composição de vários volumes antes de habilitar a operação.
- Conta, transportadoras e contratos são administrados também no serviço logístico. A interface mostra somente opções válidas retornadas pela API, nunca frete/prazo inventado.
- Frete grátis usa limite configurado em centavos, desativado quando zero. O custo logístico real continua sendo responsabilidade da loja.
- Etiquetas e contratação de coleta permanecem na operação do provedor; o painel salva transportadora, rastreio e URL HTTPS. Não há sincronização automática de eventos da transportadora nesta entrega.

## E-mail transacional

Configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM`; cadastre SPF/DKIM/DMARC na sua infraestrutura. SMTP usa TLS obrigatório e validação de certificado. Preferencialmente use credencial com permissão apenas de envio.

Execute `npm run worker:mail` a cada minuto em um worker supervisionado. Ele valida a conexão, usa lock PostgreSQL para evitar workers simultâneos e processa até 20 mensagens. Limite atual: cinco tentativas. Monitore mensagens pendentes/falhas; após corrigir o problema, reabilite tentativas de forma auditada. A entrega SMTP é pelo menos uma vez; uma queda após aceitação pode gerar reenvio com o mesmo Message-ID.

Fluxos conectados: confirmação de cadastro, recuperação de senha, pedido recebido, pagamento aprovado, etapas logísticas, reembolso, confirmação/boas-vindas/preferências da newsletter e avisos de alteração de perfil/recuperação MFA. Não imprima tokens de recuperação em logs. Cadastros em demonstração entram na fila, mas não recebem e-mail sem SMTP.

## Imagens S3

Configure `S3_BUCKET`, `S3_REGION`, `S3_ENDPOINT` (opcional para serviços compatíveis), `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` e `S3_PUBLIC_URL` HTTPS. Com AWS também é possível usar identidade de workload em vez de chaves estáticas.

Bucket privado para escrita; distribuição pública somente de imagens pela CDN/origin configurada. A credencial deve permitir `PutObject` apenas no prefixo `products/`. Upload requer gerente/admin com MFA. O endpoint aceita JPEG/PNG/WebP de até 5 MB, confere assinatura binária e gera nome UUID; SVG e executáveis são recusados. Antes de escala comercial, adicione normalização/reencoding, limites de dimensões e análise de conteúdo no pipeline de mídia. URLs externas autorizadas também podem ser cadastradas.

## Analytics e WhatsApp

Analytics e WhatsApp Business API são opcionais e não estão ativados. Não existe rastreamento de publicidade. O botão de atendimento usa apenas o número comercial salvo pelo administrador; fica oculto se não configurado. APIs de mensagens exigirão consentimento, templates e conta oficial; não há envio não autorizado nesta versão.

## Rede da nuvem

Foram solicitadas no rascunho as permissões `binaries.prisma.sh`, `api.mercadopago.com`, `sandbox.melhorenvio.com.br` e `melhorenvio.com.br`. A gravação do rascunho não aplica nem publica permissões. O caminho JavaScript do Prisma funciona sem o domínio de binários; ele permanece útil para ferramentas oficiais opcionais. Acrescente os destinos reais de SMTP/S3 ao configurar esses serviços. TCP SMTP e PostgreSQL remoto podem exigir concessões de rede apropriadas além da lista HTTP. Nunca desative TLS ou checksums.

## Ordem e concorrência de notificações financeiras

A oitava migration adiciona `Payment.providerUpdatedAt`. Webhook e conciliação consultam o pagamento no backend e serializam a gravação por lock do pedido. Eventos idênticos são deduplicados dentro dessa trava, inclusive quando chegam simultaneamente. Data/status inválidos são recusados; eventos antigos, regressões de estado e pagamentos diferentes de uma transação já confirmada são registrados para revisão, sem sobrescrever a situação financeira consolidada.

Aprovação recebida depois de cancelamento/liberação de estoque encaminha o pedido a `REFUNDING` (análise de devolução/reembolso), registra auditoria `payment.late_approval` e avisa o cliente. **Isso não executa um reembolso, não promete entrega e não reserva estoque novamente.** Atualizações repetidas não duplicam esse aviso. O operador deve consultar o provedor e tratar a situação; a aplicação não resolve automaticamente pagamentos duplicados.

`npm run payments:reconcile` pagina a busca do Mercado Pago em lotes de 50, com teto de 1000 resultados por pedido. Resultado parcial, referência divergente, resposta inválida ou excesso de páginas gera falha explícita. Falta de resultados não é prova de que uma preferência expirou ou deixou de aceitar pagamentos; nenhuma reserva é liberada por uma busca vazia. O comando ainda percorre os pedidos pendentes e exige agendamento/monitoramento na hospedagem. Cancelamento automático de preferências e resolução de criação incerta continuam pendentes.

Os testes locais de concorrência, ordem de eventos, aprovação tardia e paginação usam respostas isoladas do provedor. Não houve transação real nem homologação externa nesta etapa.
