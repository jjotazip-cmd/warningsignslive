WARNING SIGNS DESKTOP — versão para Windows

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

Na sala, escolha “Aplicativos selecionados”, marque até seis janelas/programas e inicie a transmissão. O Windows captura o áudio do processo e dos processos-filhos; duas janelas do mesmo programa podem aparecer como um único aplicativo.

O pacote usa o módulo nativo electron-native-screenshare (licença MIT) para a captura por processo no Windows. O código nativo precisa ser compilado no Windows; o workflow do GitHub faz essa compilação em um runner Windows.
