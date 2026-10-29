# Abrir a loja pelo navegador

1. Acesse https://codespaces.new/GSilveira-programador/real7?ref=main e entre no GitHub.
2. Confirme a branch `main` e crie o Codespace. O ambiente baixa dependências, cria um PostgreSQL isolado, gera a chave local e carrega produtos fictícios.
3. Aguarde a configuração terminar. Na aba **Ports / Portas**, localize **3000 — JN Chuteiras** e clique no ícone de globo para abrir a loja em outra aba. A primeira página pode levar alguns segundos para compilar.

É a aplicação Next.js com backend e banco, não a captura do GitHub Pages. Você pode navegar por catálogo, produtos, carrinho, conta e páginas de ajuda. As telas administrativas exigem usuário autorizado com MFA. Pagamentos, frete real e envio de e-mail dependem de credenciais e homologação; vendas permanecem bloqueadas. Não há usuário administrativo público padrão.

A porta 3000 deve permanecer **privada**, acessível com sua conta GitHub. O banco não é publicado. Não cadastre dados reais: este ambiente é demonstrativo. O banco usa credenciais locais de demonstração, publicadas no arquivo de configuração exclusivamente para esse ambiente isolado. `.env` e chave MFA não são enviados ao GitHub.

Se a loja não abrir, aguarde o postCreateCommand terminar. Execute `npm run dev` no terminal se o servidor estiver parado e abra a porta 3000. Para inspecionar falhas de inicialização, consulte `/tmp/jn-preview-server.log` no ambiente; não publique logs com dados privados.

O Codespace precisa estar ligado para o link responder. Parar ou excluir o Codespace interrompe o acesso; uma hospedagem permanente é uma etapa diferente. Consulte sua cota e as condições do GitHub Codespaces antes de criar o ambiente.

A configuração foi preparada e revisada no repositório. A criação de um Codespace na conta do proprietário requer sua ação e ainda não foi executada nesta sessão; não confundir com o ambiente local já validado.
