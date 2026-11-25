const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('warningSignsDesktop', {
  listAudioApps: () => ipcRenderer.invoke('desktop:list-audio-apps'),
  startAudioApps: pids => ipcRenderer.invoke('desktop:start-audio-apps', pids),
  stopAudioApps: () => ipcRenderer.invoke('desktop:stop-audio-apps'),
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
