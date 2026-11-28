WARNING SIGNS DESKTOP — versão para Windows

ATUALIZAÇÃO 1.0.8
- Atualizado o ícone do aplicativo e do instalador para a nova logo.
- A interface da janela é carregada do site publicado no Netlify. Depois de publicar o index.html atualizado, o app mostra a nova interface ao abrir; é necessário gerar um instalador novo para distribuir o ícone atualizado.

ATUALIZAÇÃO 1.0.7
- O app Windows deixou de anexar o loopback global do Electron. O áudio é montado pela captura nativa por processo, excluindo o próprio Warning Signs para evitar retorno/eco.
- No navegador, o compartilhamento pede o áudio da guia sem solicitar o mix geral do sistema.
- Se a captura nativa falhar, a transmissão é interrompida com o motivo visível para evitar compartilhar áudio incorreto.

ATUALIZAÇÃO 1.0.6
- Corrigido o recebimento das mensagens dos processos auxiliares do Electron; antes, a confirmação de início e os pacotes de áudio podiam ser descartados.
- A tela cheia aguarda a confirmação real do Windows antes de atualizar a interface e continua com fallback pela tela cheia do vídeo.
- Se o Windows não iniciar a captura de um app, o status exibe o programa e o erro recebido.

ATUALIZAÇÃO 1.0.5
- A tela cheia agora confirma o estado nativo do Windows e tem fallback para a tela cheia do vídeo; F11 alterna o modo e Esc sai dele.
- O áudio selecionado exibe um aviso se a captura iniciar sem receber amostras, em vez de indicar sucesso sem som.

Esta versão abre o site Warning Signs em uma janela de aplicativo e adiciona captura de áudio dos aplicativos escolhidos. A captura nativa usa a API WASAPI por processo. O site para celular e navegador continua disponível.

GERAR O INSTALADOR PELO GITHUB
1. Envie a pasta desktop-app e a pasta .github que acompanham este pacote para a raiz do repositório GitHub do site.
2. Envie também o index.html atualizado para a raiz do mesmo repositório e faça o commit.
3. Aguarde o Netlify concluir a publicação do site atualizado.
4. No GitHub, abra Actions > Build Warning Signs for Windows > execução mais recente.
5. Baixe o artefato warning-signs-windows-installer. Ele contém o instalador .exe.

GERAÇÃO MANUAL NO WINDOWS
1. Abra esta pasta no Windows.
2. Instale Node.js 22 e Visual Studio Build Tools com “Desenvolvimento para desktop com C++”.
3. No terminal dentro desta pasta, execute npm install e depois npm run dist.
4. O instalador aparecerá em desktop-app/dist/.

O instalador é separado do site publicado no Netlify. A opção de seleção de áudio aparece somente dentro do app Windows. No site/PWA, o navegador continua oferecendo as opções normais de compartilhamento.

Na sala, escolha “Silenciar aplicativos específicos”, marque os programas que devem ficar fora do áudio e inicie a transmissão. Os demais aplicativos abertos, listados no seletor, serão compartilhados. O limite é de oito processos por transmissão. Se a captura seletiva falhar, a transmissão é interrompida com o motivo visível. No navegador, o compartilhamento solicita áudio da guia, sem pedir o mix geral do sistema. O player inclui controle de volume e a tela cheia usa o modo nativo do Windows.

O instalador compila o capturador próprio em native/ com CMake e o SDK do Windows. O capturador usa sessões WASAPI.
