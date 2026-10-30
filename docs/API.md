# API HTTP

Prefixo `/api`. JSON UTF-8. Escritas exigem `Origin` igual à origem de `APP_URL` (exceto webhook assinado). Sessão HttpOnly `elite_session`; carrinho `elite_cart`, ambos opacos, hash no banco, SameSite=Lax e Secure em produção. Respostas de erro: `{ "error": "mensagem", "details": [{"field":"campo","message":"motivo"}] }`; detalhes apenas em validação. Não há API pública de bypass de pagamento.

## Catálogo e carrinho

| Método    | Caminho           | Uso                                                                                 |
| --------- | ----------------- | ----------------------------------------------------------------------------------- |
| GET       | `/health`         | Verifica conexão PostgreSQL                                                         |
| GET       | `/store`          | Dados comerciais públicos                                                           |
| GET       | `/catalog`        | `q, category, brand, ground, color, model, min, max, size, stock, sale, sort, page` |
| GET       | `/products/:slug` | Produto ativo, tamanhos, imagens, avaliações aprovadas                              |
| GET / PUT | `/cart`           | Lista `{variantId,quantity}`; no máximo 30 linhas, 10 unidades por linha            |
| POST      | `/cart/quote`     | `{items,coupon?}`; preços vêm do banco                                              |
| POST      | `/shipping/quote` | `{postcode,items,coupon?}`; CEP com 8 dígitos                                       |
| POST      | `/checkout`       | Cria reserva e checkout hospedado, não aprova pagamento                             |

Ordenações `newest`, `price-asc`, `price-desc`, `bestsellers`, `rating`. Vendas consideram pedidos aprovados e posteriores; avaliações somente aprovadas. Sem dados, não há ranking de vendas artificial. Preços `min/max` em reais na URL; internamente, centavos. Página com até 12 itens.

Checkout:

```json
{
  "items": [{ "variantId": "id-da-variacao", "quantity": 1 }],
  "coupon": "ELITE10",
  "shippingId": "id-retornado-pela-cotacao",
  "name": "Nome completo",
  "email": "cliente@example.com",
  "phone": "11999999999",
  "address": {
    "postcode": "01001000",
    "street": "Rua Exemplo",
    "number": "10",
    "complement": "",
    "district": "Centro",
    "city": "São Paulo",
    "state": "SP"
  },
  "idempotencyKey": "UUID-v4-gerado-uma-vez-por-tentativa"
}
```

O servidor recota frete e revalida preço/cupom/estoque. Sucesso: `{id,access,checkoutUrl}`. `access` é segredo de acompanhamento para visitante: não compartilhar, não registrar query strings em logs, não usar analytics na página. Checkout é bloqueado com 503 no modo demonstração. Conflito concorrente retorna 409, sem decremento parcial. Resposta ambígua exige consulta/conciliação, não nova compra automática.

## Autenticação e conta

| Método              | Caminho                          | Corpo / resposta                                                         |
| ------------------- | -------------------------------- | ------------------------------------------------------------------------ |
| GET                 | `/auth/me`                       | Conta pública ou null                                                    |
| POST                | `/auth/register`                 | `{name,email,password}`; resposta genérica e e-mail de verificação       |
| POST                | `/auth/login`                    | `{email,password,code?}`; TOTP obrigatório se ativado                    |
| POST                | `/auth/logout`                   | Revoga sessão                                                            |
| POST                | `/auth/forgot`                   | `{email}`; resposta genérica                                             |
| POST                | `/auth/reset`                    | `{token,password}`; revoga sessões                                       |
| POST                | `/auth/verify`                   | `{token}`; token de uso único                                            |
| POST                | `/auth/mfa/setup`                | Administrador autenticado sem MFA ativado; segredo/URI para autenticador |
| POST                | `/auth/mfa/enable`               | `{code}`; revoga sessões e exige novo login                              |
| PATCH / DELETE      | `/account`                       | Atualizar `{name}` / anonimizar com `{password}`                         |
| GET                 | `/account/export`                | Exportação LGPD dos próprios dados                                       |
| GET / POST / DELETE | `/account/addresses`             | Listar / cadastrar endereço / remover `{id}`                             |
| GET / POST / DELETE | `/favorites`                     | Listar / salvar / remover `{productId}`                                  |
| GET                 | `/orders`                        | Histórico da conta                                                       |
| GET                 | `/orders/:id?access=...`         | Dono da conta ou visitante com token                                     |
| POST                | `/orders/:id/returns?access=...` | `{reason}`; autorização igual à do pedido                                |
| POST                | `/reviews`                       | `{productId,rating,text}`; compra entregue e posterior moderação         |
| POST                | `/newsletter`                    | `{email,consent:true}`                                                   |
| POST                | `/contact`                       | `{name,email,message}`                                                   |

## Administração

Todas exigem conta staff com MFA; ações financeiras/catálogo exigem gerente/admin. Configuração e auditoria completa: admin.

| Método         | Caminho                     | Uso                                                                          |
| -------------- | --------------------------- | ---------------------------------------------------------------------------- |
| GET            | `/admin/dashboard`          | Últimos 200 pedidos, produtos, clientes, cupons, avaliações e contatos       |
| POST           | `/admin/products`           | Produto, dimensões, imagem HTTPS e variações `{size,sku,stock}`              |
| PATCH / DELETE | `/admin/products/:id`       | Editar dados comerciais / arquivar sem apagar histórico                      |
| PATCH          | `/admin/stock/:id`          | `{delta}`; ajuste incremental condicional, impede saldo negativo             |
| POST           | `/admin/uploads`            | Bytes JPEG/PNG/WebP até 5 MB; devolve URL S3                                 |
| POST           | `/admin/brands`             | `{name}`                                                                     |
| POST           | `/admin/categories`         | `{name,slug}`                                                                |
| POST           | `/admin/coupons`            | `{code,percent,minimum,limit}`; mínimo em centavos                           |
| DELETE         | `/admin/coupons/:code`      | Desativa cupom                                                               |
| PATCH          | `/admin/orders/:id`         | `{status,trackingCode?,trackingUrl?}`; somente transições logísticas válidas |
| PATCH          | `/admin/returns/:id`        | `{status}`: requested → approved/rejected → received → refunded              |
| PATCH          | `/admin/reviews/:id`        | `{approved}`                                                                 |
| PUT            | `/admin/settings`           | Dados da empresa, banner, regra de frete e ativação comercial                |
| GET            | `/admin/export?format=xlsx` | Excel; sem format retorna CSV protegido contra fórmulas                      |
| GET            | `/admin/audit`              | Últimas 100 operações auditadas                                              |

`POST /webhooks/mercadopago?data.id=ID` exige assinatura do provedor, consulta externa e deduplicação por versão do evento. Não aceita `status` enviado pelo navegador.

## Gestão comercial e catálogo versionado

- `GET /banners`: somente banners vigentes e habilitados, com campanha vigente/habilitada quando associada. Ordenação por posição/data; no máximo 20 banners. Nenhuma reprodução automática.
- `GET/POST /admin/campaigns` e `GET/POST /admin/banners`: listar/criar. Gerente ou administrador com MFA.
- `PUT /admin/campaigns/:id` e `PUT /admin/banners/:id`: dados completos e `version` atual. Conflito retorna 409. `DELETE` com `{version}` pausa o registro e mantém histórico.
- Campanha: `{name,active,startsAt,endsAt,couponCode:null|codigo}`. Datas ISO UTC, fim posterior ao início.
- Banner: `{title,subtitle,image,imageAlt,ctaLabel,href,position,active,startsAt,endsAt,campaignId:null|id}`. Destino deve ser caminho interno da loja; imagens HTTPS autorizadas ou recursos em `/images/`. Cupons continuam sujeitos às regras financeiras existentes.
- `PATCH /admin/products/:id`: substitui o snapshot editável com `{version,name,brandId,categoryId,model,color,ground,description,material,sole,weightGrams,widthCm,heightCm,lengthCm,price,compareAt,active,featured,images}`. `images` tem 1–10 entradas `{id?,url,alt}`; a ordem define posição e capa. IDs devem pertencer ao produto. Slug e marcação fictícia são preservados. Uma versão obsoleta retorna 409 sem alteração parcial.
- `POST /admin/products/:id/variants`: `{size,sku,stock}` cria nova numeração. `PATCH /admin/variants/:id` com `{version,sku,active}` edita SKU/habilitação e preserva tamanho/estoque/histórico. Ajustes de estoque continuam incrementais em `/admin/stock/:id`; tamanho é identidade permanente.
- `GET /admin/reports?from=YYYY-MM-DD&to=YYYY-MM-DD`: intervalo de até 366 dias inclusivos. Agrega todos os pedidos criados nesses dias em `America/Sao_Paulo`. Retorna `orders,paidOrders,pendingOrders,revenue,averageTicket,statuses,daily,topProducts`. Conversão é `null` enquanto não houver medição de navegação consentida. Faturamento inclui total dos pedidos aprovados e posteriores; pedidos cancelados/em devolução ficam fora. O ranking soma itens de pedidos elegíveis, sem ratear frete/cupom.
- Erro 409 de cotação por indisponibilidade inclui `unavailable:[{variantId,name,size,availableStock}]`. O cliente permite remover itens ou ajustar quantidade; a confirmação continua revalidando tudo no servidor.

## Identidade e consentimento

- `POST /newsletter` com `{email,consent:true}` registra solicitação pendente e enfileira confirmação privada válida por 24 horas. Não ativa inscrição automaticamente e mantém resposta genérica, inclusive para endereços já ativos.
- `POST /newsletter/confirm` com `{token}` confirma uma vez, grava a versão de consentimento e enfileira boas-vindas com descadastro.
- `POST /newsletter/preferences` com `{email}` responde genericamente; se houver inscrição elegível, envia o link apenas ao endereço inscrito. Não exige conta.
- `POST /newsletter/unsubscribe` com `{token}` desativa a inscrição e invalida links pendentes; repetir é idempotente. GET dos links não modifica nada.
- `PATCH /admin/users/:id/role` com `{role,version,reason,code}` exige administrador, e-mail verificado, sessão autenticada com MFA e novo código TOTP válido. Perfis: CUSTOMER, AGENT, MANAGER, ADMIN; motivo de 10–500 caracteres. Encerra sessões do alvo, gera auditoria e notificação. Conflitos de versão/último administrador retornam 409, MFA inválido 401 e falta de permissão 403.
- Uma sessão autenticada antes da ativação de MFA não adquire privilégios apenas porque o usuário tem `mfaEnabled=true`. Login com TOTP preenche a prova por sessão; ativação, recuperação e mudanças de perfil revogam sessões.
- Recuperação de MFA não tem endpoint HTTP: `npm run admin:recover-mfa` exige variáveis operacionais e registra operador/motivo. Senha continua obrigatória.
- DELETE `/account` anonimiza o cadastro, revoga tokens/sessões e remove a inscrição/newsletter não operacional. Pedidos são preservados. Cadastros com `deletedAt` não podem voltar a autenticar, mesmo com sessão/token emitido durante uma corrida de exclusão.

### Concorrência do carrinho e autenticação

`GET /cart` anônimo retorna `[]` sem Set-Cookie. O identificador HttpOnly só é emitido após um PUT válido e persistido, evitando que respostas de leituras concorrentes troquem a identidade de um carrinho já gravado. PUT recusa linhas repetidas e mantém limites de quantidade. O cliente inicializa uma vez, bloqueia gravações quando a leitura falha e permite tentar novamente; respostas antigas de cotação não substituem os valores atuais. A conclusão do checkout fica indisponível durante a recotação.

A emissão da sessão usa lock da conta e confere a senha criptografada, o estado/segredo MFA e a versão de permissões que foram validados no início do login. Se mudarem, pede nova autenticação. Isso fecha corridas entre login, reset de senha, recuperação MFA e alterações de perfil. Nenhum desses valores privados é retornado ao frontend.

Devoluções agora exigem `version` e `note` na decisão administrativa. Consulta de reembolso incerto: `POST /api/admin/returns/:id/reconcile`. Veja [RETURNS.md](RETURNS.md) para estados e limites financeiros.

Gestão de pedidos: `GET /api/admin/orders` aceita `q`, `status`, `from`, `to`, `page`, `pageSize`; `GET /api/admin/orders/:id` retorna detalhes operacionais sem tokens. Consulte [ORDER_MANAGEMENT.md](ORDER_MANAGEMENT.md).

Configurações: `PUT /api/admin/settings` exige `version`. Novos campos públicos: `instagram`, `facebook`, `youtube`, `nationwideShipping`, `legalReviewed`. `GET /api/admin/settings/readiness` retorna apenas indicadores de configuração; ambos exclusivos do administrador. Ver [STORE_SETTINGS.md](STORE_SETTINGS.md).
