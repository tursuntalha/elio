const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('elio', {
  postMessage: message => ipcRenderer.send('elio:message', message),
  onMessage: callback => {
    const listener = (_event, message) => callback(message);
    ipcRenderer.on('elio:event', listener);
    return () => ipcRenderer.removeListener('elio:event', listener);
  }
});
