# Manutenção de dados temporários

A rotina é restrita ao servidor: não existe endpoint público ou botão administrativo para executá-la. Injete DATABASE_URL pelo gerenciador de segredos da hospedagem. Não inclua credenciais na linha de comando ou no agendador.

## Conferir e executar

```sh
npm run maintenance
npm run maintenance -- --apply --batch=500
```

Sem `--apply`, a saída contém apenas contagens e datas de corte; nenhum registro é alterado. Com `--apply`, cada execução remove no máximo o tamanho do lote **por tabela** (padrão 500; permitido 1–5000). Repita em horários de menor movimento se houver acúmulo. A saída não contém e-mails, tokens, IDs de sessão ou conteúdo de mensagens.

| Registro              | Critério de remoção                  |
| --------------------- | ------------------------------------ |
| Sessão                | Expirada há mais de 24 horas         |
| Token de autenticação | Expirado há mais de 24 horas         |
| Limite de tentativas  | Janela encerrada há mais de 24 horas |
| Carrinho              | Sem atualização há mais de 90 dias   |
| E-mail enviado        | `sentAt` anterior a 30 dias          |

O prazo de e-mails conta do envio, não da criação. Mensagens pendentes ou com falha, inclusive após cinco tentativas, são preservadas para análise operacional. Não são apagados usuários, consentimentos, contatos, pedidos, pagamentos, estoque, devoluções nem auditoria. Esta rotina não substitui uma política jurídica de retenção dessas entidades.

Carrinhos antigos podem deixar de aparecer mesmo se o navegador ainda tiver seu cookie. A loja deve informar o prazo de 90 dias e o responsável deve aprová-lo antes do lançamento. A manutenção não cancela pedidos nem libera reservas financeiras: esses fluxos exigem confirmação do provedor.

## Concorrência e falhas

Cada execução usa uma transação com horário do PostgreSQL e trava consultiva, compartilhada com o migrador para não executar durante mudanças de schema. Uma segunda execução é recusada. Os registros selecionados são bloqueados com `FOR UPDATE SKIP LOCKED`, preservando carrinhos bloqueados por atualizações concorrentes. A elegibilidade é revalidada no DELETE. Falha de conexão, trava ou auditoria provoca rollback integral. A execução aplicada registra somente contagens, corte e tamanho do lote em auditoria.

A sétima migration adiciona índices para os filtros temporais. Em bases grandes, programe sua aplicação em janela de manutenção: os índices são criados pela migration transacional convencional, não com `CONCURRENTLY`.

## Agendamento na hospedagem

Agende o comando aplicado diariamente no mesmo release da aplicação, com acesso privado ao PostgreSQL, timeout superior a 30 segundos e captura de exit code. Exemplo de entrada cron, **a adaptar ao caminho e gerenciador de segredos reais**:

```cron
15 3 * * * cd /srv/elite-boots && /usr/bin/npm run maintenance -- --apply --batch=500
```

O horário acima depende do timezone do servidor. No agendador gerenciado, configure America/Sao_Paulo para 03:15 de Brasília. O exemplo não foi instalado neste ambiente. Configure alertas para execução ausente, erro e acúmulo persistente; monitore e-mails com cinco falhas separadamente. Teste a prévia e confira backup/restauração antes da primeira execução na operação comercial.
