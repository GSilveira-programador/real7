# Identidade, permissões e newsletter

## Permissões de usuários

O administrador entra com senha e MFA e acessa Clientes no painel. Ao alterar um perfil, informa motivo e um novo código do autenticador. A operação exige a versão atual das permissões, registra de/para/motivo e revoga todas as sessões da conta afetada. Não informe senhas ou chaves no motivo.

Contas de equipe só podem receber acesso após verificar o e-mail e precisam configurar MFA. Promover uma conta sem MFA não libera acesso ao painel: o usuário entra na conta, configura o autenticador, confirma e entra novamente com TOTP. Gerentes/atendentes não concedem permissões. A última conta administrativa verificada com MFA é protegida contra despromoção, inclusive quando dois administradores fazem alterações simultâneas.

A nova migration adiciona `Session.mfaVerifiedAt`. Contas administrativas que já tinham sessão antes dessa atualização devem sair e entrar novamente com o código. Não preencha esse campo manualmente para reaproveitar sessões antigas.

## Recuperação operacional de MFA

Não há rota web para desabilitar MFA. Um operador com acesso autorizado ao servidor deve:

1. Verificar a identidade do solicitante por canal independente, obter a autorização aplicável e registrar o procedimento/ticket.
2. Injetar temporariamente `RECOVERY_EMAIL`, `RECOVERY_REASON`, `RECOVERY_OPERATOR` e `RECOVERY_CONFIRM=RESET-MFA` no ambiente seguro do comando. A confirmação deve ser deliberada; `.env.example` deixa esses valores vazios.
3. Executar `npm run admin:recover-mfa` no diretório do projeto. O comando recusa clientes e contas já sem MFA, limpa o segredo antigo, revoga sessões, incrementa a versão e registra operador/motivo. A conta recebe aviso pela outbox SMTP.
4. O solicitante entra **com sua senha existente**, configura novo autenticador em Minha conta e entra novamente com TOTP. A recuperação não altera a senha nem cria sessão privilegiada. Se a senha também foi perdida, seguir o fluxo separado de recuperação por e-mail.
5. Remover as variáveis temporárias, validar o novo acesso e revisar a auditoria.

O comando não comprova sozinho a identidade humana nem substitui os controles de acesso à infraestrutura. Se afetar o último administrador, a administração ficará bloqueada até o reenrolamento; planeje a janela e o acompanhamento. Guarde `MFA_ENCRYPTION_KEY` fora do banco e mantenha backup seguro. Não copie seu valor para logs, tickets ou GitHub.

## Consentimento da newsletter

O formulário coleta consentimento explícito, mas cria inscrição **pendente**. A aplicação enfileira e-mail de confirmação com token de uso único válido por 24 horas. Só o POST de confirmação ativa a inscrição, registra horário/versão e gera boas-vindas. GET, pré-visualizações de e-mail e crawlers não confirmam nem cancelam.

O link de saída é privado e funciona sem conta. O visitante também pode acessar Preferências de e-mail no rodapé e solicitar o link para o endereço inscrito. As respostas não revelam se um endereço existe. O descadastro desativa a inscrição, invalida os tokens anteriores e remove mensagens pendentes da própria newsletter. Mensagens que já tiverem sido aceitas pelo provedor de e-mail podem não ser recolhidas. Uma nova inscrição requer nova confirmação.

Tokens de confirmação/saída são guardados como hashes para consulta; a cópia usada no envio do descadastro é criptografada. Registros de auditoria usam identificadores derivados do e-mail, sem guardar o token. Trate esses registros conforme a política LGPD revisada. A exclusão de conta remove sua inscrição e mensagens não operacionais correspondentes; documentos/pedidos têm retenção própria.

O SMTP ainda precisa ser configurado e homologado. Os testes usam a fila no banco para percorrer os links; isso não comprova entrega real. Não há envio promocional em lote nem campanhas de WhatsApp nesta versão. Inscrições anteriores à migration não são consideradas confirmadas automaticamente.
