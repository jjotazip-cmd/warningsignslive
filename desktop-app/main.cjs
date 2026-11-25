const path = require('node:path');
const { app, BrowserWindow, desktopCapturer, ipcMain, session, shell, utilityProcess } = require('electron');
const nativeAudio = require('electron-native-screenshare');

const APP_URL = 'https://warningsignslive.netlify.app/';
const APP_ORIGIN = new URL(APP_URL).origin;
let mainWindow;
let pickerWindow;
const audioWorkers = new Map();

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
    backgroundColor: '#0a0a0a',
    title: 'Warning Signs',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
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
  mainWindow.on('closed', () => { mainWindow = null; stopAllAudioWorkers(); });
}

function parseWindowHandle(sourceId) {
  const match = /^window:(\d+):/.exec(sourceId || '');
  return match ? Number(match[1]) : 0;
}

async function listWindows() {
  const sources = await desktopCapturer.getSources({
    types: ['window'],
    thumbnailSize: { width: 0, height: 0 },
    fetchWindowIcons: true
  });
  const byPid = new Map();
  for (const source of sources) {
    const handle = parseWindowHandle(source.id);
    if (!handle) continue;
    let pid = 0;
    try { pid = nativeAudio.getPidFromWindowHandle(handle); } catch {}
    if (!pid || pid === process.pid || byPid.has(pid)) continue;
    byPid.set(pid, { pid, name: (source.name || 'Aplicativo').trim() });
  }
  return [...byPid.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
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

function stopWorker(pid) {
  const worker = audioWorkers.get(pid);
  if (!worker) return;
  audioWorkers.delete(pid);
  try { worker.postMessage({ command: 'stop' }); } catch {}
  setTimeout(() => { try { worker.kill(); } catch {} }, 500);
}

function stopAllAudioWorkers() {
  for (const pid of [...audioWorkers.keys()]) stopWorker(pid);
}

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
    let origin = '';
    try { origin = new URL(details.requestingUrl || webContents.getURL()).origin; } catch {}
    callback(origin === APP_ORIGIN && permission === 'display-capture');
  });

  session.defaultSession.setDisplayMediaRequestHandler(async (request, callback) => {
    if (!request.frame || !request.securityOrigin || new URL(request.securityOrigin).origin !== APP_ORIGIN) {
      callback(null);
      return;
    }
    const video = await chooseScreenSource();
    if (!video) { callback(null); return; }
    callback({ video, ...(request.audioRequested ? { audio: 'loopback' } : {}) });
  });

  ipcMain.handle('desktop:list-audio-apps', event => isTrusted(event) ? listWindows() : []);
  ipcMain.handle('desktop:start-audio-apps', async (event, pids, includeMode = false) => {
    if (!isTrusted(event) || !Array.isArray(pids) || typeof includeMode !== 'boolean') return { started: [], failed: [] };
    stopAllAudioWorkers();
    const uniquePids = [...new Set(pids.map(Number).filter(pid => Number.isInteger(pid) && pid > 0 && pid !== process.pid))];
    const workerLimit = includeMode ? 8 : 1;
    if (uniquePids.length > workerLimit) {
      return { started: [], failed: uniquePids.map(pid => ({ pid, error: 'Limite de ' + workerLimit + ' processos de áudio por transmissão.' })) };
    }
    const safePids = uniquePids;
    const results = await Promise.all(safePids.map(pid => new Promise(resolve => {
      let settled = false;
      let worker;
      const finish = result => { if (settled) return; settled = true; clearTimeout(timer); resolve(result); };
      const timer = setTimeout(() => { stopWorker(pid); finish({ pid, error: 'Tempo limite ao iniciar a captura.' }); }, 8000);
      try {
        worker = utilityProcess.fork(path.join(__dirname, 'audio-worker.cjs'), [], { serviceName: 'Warning Signs audio capture' });
        audioWorkers.set(pid, worker);
        worker.on('message', event => {
          const message = event.data || {};
          if (message.type === 'started') finish({ pid, ok: true });
          if (message.type === 'error') finish({ pid, error: message.error || 'Falha na captura nativa.' });
          if (!mainWindow || mainWindow.isDestroyed()) return;
          if (message.type === 'audio') mainWindow.webContents.send('desktop:audio-data', message);
          if (message.type === 'error') mainWindow.webContents.send('desktop:audio-error', { pid, error: message.error });
        });
        worker.on('exit', code => {
          if (audioWorkers.get(pid) === worker) audioWorkers.delete(pid);
          if (!settled) finish({ pid, error: 'O capturador de áudio fechou (código '+code+').' });
        });
        worker.postMessage({ command: 'start', pid, includeMode });
      } catch (error) {
        if (worker) stopWorker(pid);
        finish({ pid, error: String(error.message || error) });
      }
    })));
    return {
      started: results.filter(result => result.ok).map(result => result.pid),
      failed: results.filter(result => !result.ok).map(result => ({ pid: result.pid, error: result.error }))
    };
  });
  ipcMain.handle('desktop:stop-audio-apps', event => {
    if (!isTrusted(event)) return false;
    stopAllAudioWorkers();
    return true;
  });
  createWindow();
});

app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
app.on('window-all-closed', () => { stopAllAudioWorkers(); if (process.platform !== 'darwin') app.quit(); });
