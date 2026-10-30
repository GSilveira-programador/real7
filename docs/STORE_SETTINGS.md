# Configurações comerciais

A aba **Configurações** é exclusiva do administrador com sessão MFA. Campos são públicos por natureza: razão social, CNPJ, endereço, e-mail, WhatsApp, horário, banner, limite de frete grátis e perfis oficiais. Não armazene credenciais aqui. As chaves dos serviços permanecem no gerenciador de segredos/variáveis do servidor.

## Validação e concorrência

CNPJ aceita formato numérico ou alfanumérico, normaliza pontuação/caixa e confere dígitos verificadores pelo algoritmo aplicável. Essa validação **não consulta a Receita Federal e não comprova situação cadastral, titularidade ou existência da empresa**. WhatsApp é normalizado para dígitos com DDI. Perfis de Instagram, Facebook e YouTube exigem HTTPS, domínio correspondente e caminho; URLs com credenciais, domínios parecidos e esquemas inseguros são recusados.

A décima segunda migration adiciona `Setting.version`. A API exige a versão recebida, serializa gravações e registra a atualização em auditoria na mesma transação. Se outro administrador salvou primeiro, a tentativa obsoleta recebe 409 e precisa recarregar; não substitua a versão manualmente sem revisar os dados atuais. Clientes antigos sem `version` deixam de poder salvar.

Somente campos definidos na configuração são persistidos; segredos de serviços não fazem parte do contrato. O formulário indica frete grátis em reais, mas o servidor armazena centavos inteiros. Zero desativa a regra. Não são criados canais fictícios quando os campos estão vazios.

## Exibição

Perfis configurados aparecem na página de contato. CNPJ configurado aparece no rodapé, junto à identificação comercial já existente. A mensagem de entrega nacional exige vendas habilitadas e confirmação explícita `nationwideShipping`; esse checkbox é uma declaração operacional da equipe, não uma verificação de cobertura pelas transportadoras. Em modo demonstrativo, o aviso de vendas desativadas é preservado.

## Preparação para ativar vendas

`GET /api/admin/settings/readiness` retorna rótulos e indicadores de configuração, sem expor valores de segredos. A lista reflete os dados já salvos e verifica presença/formato local:

- modo demonstrativo desativado;
- dados comerciais/atendimento e CNPJ com dígitos válidos;
- confirmação da equipe de que revisou as políticas (`legalReviewed`);
- configuração Mercado Pago (token, assinatura e recebedor);
- token de frete e CEP de origem;
- servidor de e-mail e remetente;
- APP_URL com HTTPS.

Essas condições bloqueiam uma nova ativação incompleta pelo painel. **Não são testes de conexão, validade/autorização das credenciais, domínio publicado, reputação de e-mail, cadastro empresarial, aprovação jurídica ou prontidão comercial.** Revisão humana, homologação do gateway/frete/SMTP, estoque real, acesso administrativo, backups, monitoramento e demais itens de PRODUCTION.md continuam necessários. Uma confirmação de revisão não substitui trabalho jurídico. A mudança não desativa automaticamente lojas que já estavam ativas antes desta versão.

O painel não ativa serviços e não envia transações para verificar as credenciais. O checkbox de vendas não remove `DEMO_MODE` do servidor. Regras de compra e confirmação continuam sendo aplicadas pelo backend.

## Atualização

Pare o servidor antes de atualizar cliente e migrations. Depois de `git pull origin main`, execute `npm ci`, `npm run db:generate`, `npm run db:migrate` e reinicie o servidor. Um processo antigo pode manter o Prisma anterior em memória e recusar campos novos. Preserve `.env` e a chave de criptografia existente.

## API

`PUT /api/admin/settings`: campos comerciais já existentes mais `version`, `instagram`, `facebook`, `youtube`, `nationwideShipping` e `legalReviewed`. Os novos campos públicos têm defaults seguros; `version` é obrigatório. Retorna dados salvos e nova versão. O endpoint de preparação e a gravação exigem administrador, não apenas gerente/atendente.

Testes usam fixtures fictícias e restauram a configuração anterior. A validação de perfis não consulta páginas externas. Nenhuma configuração de serviço real ou ativação de vendas foi executada nesta etapa.
