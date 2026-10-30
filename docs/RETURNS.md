# Devoluções e reembolso integral

## Cliente e equipe

A página privada do pedido permite solicitar análise depois de pagamento aprovado, inclusive antes da entrega. A submissão é serializada por pedido: apenas uma solicitação não recusada pode existir, mesmo sob requisições simultâneas. Uma recusa permite nova análise, preservando o histórico anterior. O formulário é ocultado quando já existe uma solicitação em andamento ou o pedido não está elegível.

Administrador/gerente com sessão MFA usa a aba **Devoluções**. As decisões exigem versão atual e observação de 10–1000 caracteres, exibida ao cliente e registrada na auditoria. Não coloque segredos ou notas internas nesse campo. Atendente pode consultar o dashboard conforme suas permissões, mas não executar decisões financeiras.

Fluxo: **Em análise → Aprovada → Produto recebido → Reembolso confirmado**. A primeira etapa também permite **Não aprovada**. As transições não são atalhos para ignorar a conferência física, os direitos do consumidor ou a análise da equipe. O fluxo atual pressupõe recebimento antes do reembolso; cancelamento antes de expedição, trocas por outro item, arrependimento com particularidades, compensações, estornos parciais e exceções legais exigem definição operacional própria. Não imponha esse fluxo como regra jurídica universal.

## Operação financeira

O reembolso integral exige pagamento conciliado com status aprovado. Antes de chamar a API, o servidor grava uma tentativa exclusiva (`processing`) em transação. A chave de idempotência é estável por pedido (`refund-order-<orderId>`). Dois operadores concorrentes não enviam dois POSTs. A resposta precisa identificar pagamento e reembolso, confirmar status e coincidir com o total em centavos.

A confirmação grava solicitação, status do pedido, evento, auditoria e e-mail na mesma transação. O pedido fica em **Devolução/reembolso em andamento** para acompanhamento financeiro; a solicitação mostra **Reembolso confirmado**. O prazo de crédito segue a instituição financeira. Nenhuma etapa repõe estoque: o operador deve conferir a condição física e fazer ajuste auditado separadamente.

Timeout, resposta inválida ou falha de persistência deixam a tentativa em **consulta** (`uncertain`). A interface bloqueia nova tentativa financeira e oferece **Consultar reembolso**. Essa ação faz somente GET à lista de reembolsos do pagamento. Confirma apenas reembolso integral aprovado, com ID, pagamento e valor correspondentes; uma lista vazia não libera nova tentativa. Consultas simultâneas são idempotentes e não duplicam avisos. Uma falha logo após o claim pode deixar `processing`; a mesma consulta também está disponível nesse estado.

Se o provedor não confirmar, a equipe deve analisar o pagamento no painel oficial. O sistema não apaga a incerteza, não promete que o dinheiro foi devolvido e não repete automaticamente a operação. Não edite o banco para liberar uma tentativa sem investigação e autorização operacional. Casos de reembolso dividido em múltiplos valores exigem análise manual.

## Compatibilidade e atualização

A nona migration adiciona versão, observação, estado de tentativa e ID do reembolso; solicitações já reembolsadas ficam confirmadas. A décima protege solicitações antigas em `received` com versão zero, pois o fluxo antigo não registrava de forma confiável se houve tentativa antes de uma falha. Elas passam a incertas e exigem consulta, evitando repetir operações com uma nova chave.

No ambiente em execução, atualize o código, gere o cliente e aplique migrations antes de iniciar o servidor:

```sh
git pull origin main
npm ci
npm run db:generate
npm run db:migrate
npm run dev
```

O backend anterior não deve continuar escrevendo durante a migração para o novo fluxo. Pare o servidor antes da atualização em ambientes persistentes; em produção, planeje a janela de manutenção. Não misture o migrador SQL do projeto com `prisma migrate deploy`.

## API

- `POST /api/orders/:id/returns?access=...`: motivo, protegido pelo proprietário/token privado do pedido.
- `PATCH /api/admin/returns/:id`: `{ "status": "approved|rejected|received|refunded", "version": 0, "note": "Observação para o cliente" }`.
- `POST /api/admin/returns/:id/reconcile`: consulta uma tentativa já iniciada; não envia novo reembolso.

Operações administrativas exigem gerente/admin, MFA da sessão e validação de Origin. Resposta `{ok:false,pending:true,message:...}` não significa sucesso financeiro; a interface exibe a mensagem e mantém a consulta pendente.

## Limites da validação

Testes automatizados usam respostas isoladas do provedor para concorrência, timeout, divergência de valor/pagamento e conciliação. O teste do navegador usa fixtures claramente fictícias e não faz chamada financeira real. Homologação Mercado Pago, envio SMTP efetivo, revisão jurídica e procedimentos da equipe continuam obrigatórios antes do lançamento comercial.
