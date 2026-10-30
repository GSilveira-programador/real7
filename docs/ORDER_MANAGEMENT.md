# Busca e gestão de pedidos

A aba **Pedidos** pesquisa o histórico completo, independentemente dos últimos 200 pedidos usados nos indicadores resumidos. Administrador, gerente e atendente precisam de sessão com MFA para consultar e avançar a logística; clientes comuns não acessam esses endpoints.

## Filtros e navegação

- Busca por nome do cliente, e-mail, ID completo/final do ID ou código de rastreio, sem distinguir maiúsculas e minúsculas.
- Situação do pedido combinada com a busca e o período.
- Sem datas, consulta todo o histórico. Se usar período, informe início e fim, em dias de Brasília, com até 366 dias inclusivos.
- Páginas de 20 pedidos na interface; API aceita de 1 a 50 por página. Ordenação por criação decrescente e ID decrescente desempata horários iguais.

A contagem e a página são lidas no mesmo snapshot de transação. Se uma página deixa de existir, o servidor retorna a última página válida; lista vazia usa página 1 de 1. Ao trocar os filtros, a interface retorna à primeira página e descarta respostas anteriores. Alterações entre consultas ainda podem mover resultados entre páginas; não é uma exportação congelada nem paginação por cursor.

A décima primeira migration adiciona índices de data/ID e situação/data/ID. Busca textual parcial ainda pode exigir varredura; avaliar índices de busca e planos reais conforme volume. A criação de índices na migration convencional exige janela adequada em bases grandes.

## Detalhes e operação

Abrir um pedido carrega contato/endereço, itens com tamanho e SKU, totais, entrega/rastreio e histórico. A interface oferece somente os próximos avanços logísticos permitidos. Envio exige código de rastreio; o link opcional precisa usar HTTPS. Pagamentos e reembolsos não podem ser forçados por esse formulário.

Status, envio, evento, e-mail e auditoria logística são persistidos na mesma transação. Se outro operador já alterou o estado, a operação é revalidada no servidor. O sistema não integra etiquetas ou rastreamento automático; os dados logísticos dessa tela são inseridos pela equipe.

As consultas usam projeção explícita. Não retornam hash de acesso, ciphertext de visitante, hashes internos, URL do checkout ou chave de idempotência. A listagem omite endereço/telefone e os detalhes são carregados apenas ao abrir. O resumo do dashboard agora contém somente ID, status, total e data para os indicadores, em vez de copiar o pedido completo.

## API

- `GET /api/admin/orders?q=...&status=PAID&from=2026-10-01&to=2026-10-30&page=1&pageSize=20`
- `GET /api/admin/orders/:id`
- `PATCH /api/admin/orders/:id`: avanço logístico com `status` e, quando aplicável, `trackingCode`/`trackingUrl`.

Listagem retorna `orders`, `total`, `page`, `pages` e `pageSize`. Falhas de filtro são recusadas pela validação do servidor. Os dados são pessoais: use apenas a equipe autorizada, acesso privado e logs sem conteúdo de buscas por e-mail/nome (`q`).

## Validação

Testes PostgreSQL incluem 201 pedidos na mesma data, busca por pedido antigo, filtros combinados, limites de meia-noite de Brasília, página além do fim, resultados vazios, entradas inválidas e ausência de segredos nas respostas. O teste do navegador usa atendente com sessão MFA de fixture e pedidos inteiramente fictícios para validar busca, segunda página, detalhes, avanço de logística/auditoria e bloqueio de acesso anônimo.
