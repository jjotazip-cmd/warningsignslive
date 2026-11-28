const path = require('node:path');
const { app, BrowserWindow, desktopCapturer, ipcMain, session, shell } = require('electron');
const audio = require('./audio-router.cjs');

const APP_URL = 'https://warningsignslive.netlify.app/';
const APP_ORIGIN = new URL(APP_URL).origin;
let mainWindow;
let pickerWindow;
let captureSource = null;
let selectedSource = null;
let offeredIds = new Set();
const sourceTypes = ['screen', 'window'];


function isTrusted(event) {
  try { return new URL(event.senderFrame.url).origin === APP_ORIGIN; }
  catch { return false; }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 620,
    fullscreenable: true,
    backgroundColor: '#0a0a0a',
    title: 'Warning Signs',
    icon: path.join(__dirname, 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  mainWindow.on('enter-full-screen', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.webContents.send('desktop:fullscreen-changed', true);
  });
  mainWindow.on('leave-full-screen', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.webContents.send('desktop:fullscreen-changed', false);
  });
  mainWindow.webContents.on('will-navigate', (event, targetUrl) => {
    try {
      if (new URL(targetUrl).origin !== APP_ORIGIN) {
        event.preventDefault();
        shell.openExternal(targetUrl);
      }
    } catch { event.preventDefault(); }
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try { shell.openExternal(url); } catch {}
    return { action: 'deny' };
  });
  mainWindow.loadURL(APP_URL);
  mainWindow.on('closed', () => { mainWindow = null; audio.stop(); });
}

function chooseScreenSource() {
  return new Promise(async resolve => {
    const sources = await desktopCapturer.getSources({
      types: ['screen', 'window'],
      thumbnailSize: { width: 360, height: 220 },
      fetchWindowIcons: true
    }).catch(() => []);
    if (!sources.length || !mainWindow) return resolve(null);
    pickerWindow = new BrowserWindow({
      parent: mainWindow,
      modal: true,
      width: 760,
      height: 620,
      minWidth: 520,
      minHeight: 420,
      title: 'Escolher o que compartilhar',
      backgroundColor: '#111111',
      webPreferences: {
        preload: path.join(__dirname, 'picker-preload.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    });
    const currentPicker = pickerWindow;
    let settled = false;
    const finish = source => {
      if (settled) return;
      settled = true;
      if (pickerWindow === currentPicker) pickerWindow = null;
      if (!currentPicker.isDestroyed()) currentPicker.close();
      resolve(source || null);
    };
    const onPick = (event, sourceId) => {
      if (event.sender !== currentPicker.webContents) return;
      ipcMain.removeListener('screen-picker:choose', onPick);
      finish(sources.find(source => source.id === sourceId) || null);
    };
    const onCancel = event => {
      if (event.sender !== currentPicker.webContents) return;
      ipcMain.removeListener('screen-picker:cancel', onCancel);
      ipcMain.removeListener('screen-picker:choose', onPick);
      finish(null);
    };
    ipcMain.on('screen-picker:choose', onPick);
    ipcMain.on('screen-picker:cancel', onCancel);
    currentPicker.on('closed', () => {
      ipcMain.removeListener('screen-picker:choose', onPick);
      ipcMain.removeListener('screen-picker:cancel', onCancel);
      finish(null);
    });
    currentPicker.webContents.once('did-finish-load', () => {
      currentPicker.webContents.send('screen-picker:sources', sources.map(source => ({
        id: source.id,
        name: source.name,
        thumbnail: source.thumbnail.toDataURL()
      })));
    });
    await currentPicker.loadFile(path.join(__dirname, 'picker.html'));
  });
}

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
    let origin = '';
    try { origin = new URL(details.requestingUrl || webContents.getURL()).origin; } catch {}
    callback(origin === APP_ORIGIN && (permission === 'display-capture' || permission === 'fullscreen' || (permission === 'media' && details.mediaTypes?.every(type => type === 'audio'))));
  });

  session.defaultSession.setDisplayMediaRequestHandler(async (request, callback) => {
    if (!request.frame || !request.securityOrigin || new URL(request.securityOrigin).origin !== APP_ORIGIN) {
      callback(null);
      return;
    }
    const choice = selectedSource;
    selectedSource = null;
    const video = choice && choice.frame === request.frame && choice.until > Date.now()
      ? (await desktopCapturer.getSources({types: sourceTypes, thumbnailSize: {width:0,height:0}}).catch(()=>[])).find(item=>item.id===choice.id)
      : await chooseScreenSource();
    if (!video) { callback(null); return; }
    // O loopback do Electron é o mix global do Windows. O áudio da sala e
    // aplicativos excluídos voltariam para a transmissão. O áudio é injetado
    // separadamente pelo capturador seletivo do app.
    let pid = 0;
    const windowSource = video.id.startsWith('window:');
    if (windowSource) {
      try { pid = await audio.windowPid(video.id); } catch {}
    }
    captureSource = { kind: windowSource ? 'window' : 'screen', pid };
    callback({ video });
  });

  ipcMain.handle('desktop:list-sources', async event => {
    if (!isTrusted(event) || event.senderFrame !== mainWindow?.webContents.mainFrame) return [];
    selectedSource = null;
    const entries = await desktopCapturer.getSources({types: sourceTypes, thumbnailSize:{width:240,height:140}});
    offeredIds = new Set(entries.map(item => item.id));
    return entries.map(item => ({id:item.id,name:item.name,image:item.thumbnail.isEmpty()?'':item.thumbnail.toDataURL()}));
  });
  ipcMain.handle('desktop:select-source', (event,id) => {
    if (!isTrusted(event) || event.senderFrame !== mainWindow?.webContents.mainFrame || !offeredIds.has(id)) return false;
    selectedSource = {id,frame:event.senderFrame,until:Date.now()+15000};
    return true;
  });
  ipcMain.handle('desktop:source', event => isTrusted(event) ? captureSource : null);
  ipcMain.handle('desktop:list-audio-apps', event => isTrusted(event) ? audio.sessions([process.pid]) : []);
  ipcMain.handle('desktop:start-audio-apps', async (event, ids, include, blocked = []) => {
    if (!isTrusted(event) || !Array.isArray(ids) || !Array.isArray(blocked) ||
        typeof include !== 'boolean' || ![...ids,...blocked].every(pid => Number.isSafeInteger(pid) && pid >= 0)) {
      throw new Error('Seleção de áudio inválida.');
    }
    const sender=event.sender;
    return audio.start(ids,include,blocked,(channel,data)=>{
      if (!sender.isDestroyed()) sender.send(channel,data);
    });
  });
  ipcMain.handle('desktop:stop-audio-apps', event => {
    if (!isTrusted(event)) return false;
    audio.stop();
    return true;
  });
  ipcMain.handle('desktop:set-fullscreen', (event, enabled) => {
    if (!isTrusted(event) || !mainWindow || mainWindow.isDestroyed()) return false;
    const target = Boolean(enabled);
    if (mainWindow.isFullScreen() === target) return true;
    return new Promise(resolve => {
      const window = mainWindow;
      const eventName = target ? 'enter-full-screen' : 'leave-full-screen';
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        window.removeListener(eventName, onChange);
        resolve(!window.isDestroyed() && window.isFullScreen() === target);
      };
      const onChange = () => finish();
      const timer = setTimeout(finish, 1800);
      window.once(eventName, onChange);
      try { window.setFullScreen(target); } catch { finish(); }
    });
  });
  createWindow();
});

app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
app.on('window-all-closed', () => { audio.stop(); if (process.platform !== 'darwin') app.quit(); });
