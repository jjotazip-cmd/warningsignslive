WARNING SIGNS — conexão TURN no Netlify

Este pacote contém index.html e uma Netlify Function para buscar credenciais temporárias do servidor TURN da Metered. A chave privada fica nas variáveis de ambiente do Netlify, não no HTML.

ANTES DE PUBLICAR
1. No painel da Metered, copie o nome do app (a parte antes de .metered.live) e a API Key da conta.
2. No Netlify, abra o projeto do site: Project configuration > Environment variables.
3. Crie METERED_APP_NAME com o nome do app e METERED_API_KEY com a chave. Se houver escolha de escopo, inclua Functions.
4. Publique o projeto com a pasta netlify/functions e o arquivo netlify.toml. Só substituir o index.html por upload manual não publica a função.

O Netlify exige deploy por Git conectado ou pela Netlify CLI para publicar Functions. Depois de configurar as variáveis, faça um novo deploy.

A função fica disponível em /.netlify/functions/turn-credentials. O site mantém conexão direta como fallback caso o serviço TURN esteja indisponível.

Não coloque a API Key no HTML nem envie a chave em mensagens.

APP WINDOWS — CAPTURA DE ÁUDIO POR PROGRAMA
A pasta desktop-app contém o projeto do aplicativo Windows. A pasta .github/workflows inclui a automação que compila o instalador no Windows após o commit. Veja desktop-app/README.txt para as etapas de publicação e download do .exe.


CONTAS, PERFIL E GRUPOS
A pasta netlify/functions inclui as funções de conta e sincronização. O package.json da raiz instala as dependências usadas por elas.
No painel do Netlify, ative Identity, deixe o cadastro aberto e habilite cadastro sem confirmação em Identity > Emails > Confirmation template (autoconfirm). Depois publique por Git ou Netlify CLI.
O cadastro do Warning Signs pede apenas nome de usuário e senha; o Identity usa um endereço técnico interno. Como não há e-mail no cadastro, não existe recuperação de senha por e-mail.
Os grupos e o perfil são sincronizados entre dispositivos depois de entrar na conta.
