const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('screenPicker', {
  onSources: callback => { ipcRenderer.on('screen-picker:sources', (_event, sources) => callback(sources)); },
  choose: sourceId => ipcRenderer.send('screen-picker:choose', sourceId),
  cancel: () => ipcRenderer.send('screen-picker:cancel')
});
