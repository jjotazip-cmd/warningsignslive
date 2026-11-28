const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('warningSignsDesktop', {
  listSources: () => ipcRenderer.invoke('desktop:list-sources'),
  selectSource: id => ipcRenderer.invoke('desktop:select-source', id),
  captureSource: () => ipcRenderer.invoke('desktop:source'),
  listAudioApps: () => ipcRenderer.invoke('desktop:list-audio-apps'),
  startAudioApps: (pids, includeMode = false, blocked = []) => ipcRenderer.invoke('desktop:start-audio-apps', pids, includeMode, blocked),
  stopAudioApps: () => ipcRenderer.invoke('desktop:stop-audio-apps'),
  setFullscreen: enabled => ipcRenderer.invoke('desktop:set-fullscreen', Boolean(enabled)),
  onFullscreenChange: callback => {
    const handler = (_event, enabled) => callback(Boolean(enabled));
    ipcRenderer.on('desktop:fullscreen-changed', handler);
    return () => ipcRenderer.removeListener('desktop:fullscreen-changed', handler);
  },
  onAudioData: callback => {
    const handler = (_event, message) => callback(message);
    ipcRenderer.on('desktop:audio-data', handler);
    return () => ipcRenderer.removeListener('desktop:audio-data', handler);
  },
  onAudioError: callback => {
    const handler = (_event, message) => callback(message);
    ipcRenderer.on('desktop:audio-error', handler);
    return () => ipcRenderer.removeListener('desktop:audio-error', handler);
  }
});
