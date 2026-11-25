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
