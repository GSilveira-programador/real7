# Administrar o catálogo da JN Chuteiras

## Primeiro acesso sem senha no terminal

Atualize o ambiente onde a loja está rodando antes de usar esta etapa. Pare o servidor, execute `git pull origin main`, `npm ci`, `npm run db:generate`, `npm run db:migrate` e reinicie com `npm run dev`. Preserve `.env` e a chave de criptografia existente.

Abra outro terminal no Codespaces e execute:

```sh
npm run admin:invite
```

Informe o e-mail do primeiro administrador. O comando gera um **link privado válido por uma hora**, no domínio configurado em APP_URL. Abra o link, preencha nome/e-mail e escolha uma senha de pelo menos 12 caracteres no navegador. A opção **Mostrar senha enquanto digito** permite conferir o que foi digitado. O link contém um segredo de ativação: não envie por chat público, não coloque no Git e não compartilhe capturas do terminal. Um novo convite invalida o anterior.

Depois, entre em `/conta`, clique em **Configurar autenticador**, leia o QR code com um aplicativo autenticador e confirme o código. Entre novamente com senha e código para abrir `/admin`. O acesso continua protegido por MFA; criar a conta não dá acesso administrativo a uma sessão sem essa confirmação.

O convite inicial não pode ser emitido se já existe administrador e não promove uma conta de cliente existente. Nesse caso, use o login/redefinição da conta já existente ou o procedimento operacional documentado em IDENTITY_AND_NEWSLETTER.md. Não há usuário/senha padrão público. O operador que executa o comando no servidor deve verificar quem está autorizado a receber o acesso. Esta função é de bootstrap, não um sistema geral de convites da equipe.

O código de ativação é enviado no fragmento da URL (`#token=...`), que não vai na requisição HTTP; o navegador o remove do endereço após ler. Não há ativação por GET: criar a conta exige envio do formulário. Um link aberto sem o fragmento mostra somente as instruções; se atualizar a página antes de criar a conta, reabra o link privado original.

## Cadastrar produto, cor e tamanho

1. Entre em **Produtos e estoque → Novo produto**.
2. Envie a foto de capa do computador/celular. O campo do endereço da foto será preenchido automaticamente.
3. Preencha nome, URL amigável única (por exemplo `modelo-cor`), marca, categoria, terreno, linha/modelo, cor, preço em reais, descrição e especificações verificadas. Cadastre marcas/categorias na seção correspondente se ainda não existirem.
4. Informe os tamanhos separados por vírgula e a quantidade inicial. Depois é possível ajustar cada tamanho separadamente, arquivar variações e adicionar numerações.
5. Salve. O produto começa **inativo**, como rascunho. Abra o cadastro para revisar a galeria e os dados e marque **Produto ativo** quando estiver pronto para aparecer na vitrine. Isso não ativa vendas globais.

Cada **cor é um cadastro separado**, com galeria, SKU e quantidades por tamanho próprios. Não há seletor de cor unificado entre esses cadastros nesta versão. Use nomes claros, como modelo + cor, e slugs distintos. Não invente estoque físico para vendas sob encomenda: essa modalidade exige adaptar disponibilidade, reserva, prazo e frete antes de habilitar checkout. Os dados de logística atuais ainda atendem ao fluxo originalmente implementado; envio internacional direto, divisão de frete e impostos não são ativados por este módulo.

## Galeria de fotos

Abra o produto e use **Adicionar várias fotos desta cor**. A galeria aceita até **10 fotos** por produto/cor, incluindo a capa. Use as setas para ordenar; a primeira imagem é a capa. Também é possível substituir fotos individualmente ou usar uma URL HTTPS autorizada. Preencha texto alternativo útil para acessibilidade. Clique em **Salvar produto e galeria** para associar as alterações ao produto.

Arquivos devem ser JPEG, PNG ou WebP estáticos, até **5 MB por arquivo e 20 megapixels**. O servidor decodifica, aplica orientação, remove metadados e reencoda em WebP, limitando o lado maior a 2400 pixels. SVG, formatos não permitidos, imagens animadas e arquivos inválidos são recusados. As imagens enviadas são públicas; não envie documentos ou fotos privadas. Garanta autorização para usar o material fornecido.

Sem S3 configurado, os arquivos são gravados em `MediaAsset` no PostgreSQL e servidos em `/images/uploads/<id>.webp`. O limite acumulado desse armazenamento é **500 MB** e as fotos entram no backup do banco. O modo banco é adequado ao início da operação; exige acompanhar uso, backups e custo do PostgreSQL. Em escala, configure S3/CDN.

`MEDIA_STORAGE=database` força o banco. `MEDIA_STORAGE=s3` exige S3 configurado. Sem a variável, S3 é usado quando S3_BUCKET existe; caso contrário usa o banco. Uma configuração parcial de S3 não cai silenciosamente no banco. Os mesmos limites e processamento se aplicam ao upload S3. URLs antigas continuam funcionando pelo provedor original; não há migração automática de arquivos.

Enviar foto e salvar produto são etapas diferentes. Remover uma foto da galeria não apaga imediatamente o arquivo público; uploads não associados ou removidos ainda contam na cota. Não há limpeza automática de arquivos órfãos nesta versão. A equipe operacional deve planejar limpeza segura e migração antes de atingir a cota; nunca apague imagens ainda referenciadas por produtos ou banners.

## Verificação e operação

A décima terceira migration cria convites iniciais e armazenamento de mídia. O código mantém autorização de gerente/admin com MFA e proteção de Origin nos uploads, hash e consumo transacional de convites, limite por arquivo e cota acumulada sob trava. Nunca envie `.env`, dumps do banco ou links de ativação ao GitHub.

O teste `npm run test:e2e:bootstrap` precisa de banco de teste sem administradores e roda isolado, antes dos outros E2E. Ele cria/remova apenas suas fixtures. Não execute suítes de testes contra uma operação comercial. Os testes normais de mídia verificam criação de rascunho, capa/galeria, cor, preço, estoque por tamanho, autenticação e resposta WebP pública.
